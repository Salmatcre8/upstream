#![no_std]
//! # Upstream
//!
//! Weighted, nestable, pull-based fund splits for Stellar.
//!
//! A *split* routes everything it receives to a list of weighted recipients.
//! A recipient is either an account (any `G...` or `C...` address) or another
//! split, so projects can build dependency trees: an app routes 10% of its
//! income to a split of its open-source dependencies, which in turn routes a
//! share to *their* dependencies.
//!
//! ## How funds move
//!
//! 1. `deposit` pulls tokens into this contract and credits the split's
//!    current epoch. Cost is O(1) no matter how many recipients there are.
//! 2. Recipients settle lazily:
//!    - `collect` pays an account recipient its share (permissionless, always
//!      paid to the recipient itself), or `collect_to` lets the recipient pick a
//!      destination such as a muxed address.
//!    - `pull` moves a nested split's share into that split's own current
//!      epoch (permissionless), one hop at a time.
//!
//! Nothing is ever pushed to a list of recipients in one call, so a recipient
//! with a missing trustline, a frozen balance or an archived entry cannot block
//! anyone else.
//!
//! ## Epochs
//!
//! Every recipients update starts a new epoch. Funds credited to an epoch are
//! always shared by that epoch's recipients, so updates are O(1) and can never
//! redirect money that was already received. Past epochs stay claimable.
//! `lock` makes a split's recipients permanent.
//!
//! ## Accounting
//!
//! Each `(split, epoch, token)` tracks `acc`, the total amount credited. A
//! recipient with weight `w` is owed `floor(w * acc / TOTAL_WEIGHT)` in total,
//! and each settlement pays the difference against the checkpoint stored at its
//! last settlement. Rounding therefore never compounds: each recipient loses at
//! most one base unit per epoch, and that dust stays in the contract.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, token,
    Address, Env, MuxedAddress, Vec,
};

/// Sum of recipient weights in every split (parts per million).
pub const TOTAL_WEIGHT: u32 = 1_000_000;

/// Maximum recipients per split. Keeps validation and config storage bounded.
pub const MAX_RECIPIENTS: u32 = 50;

const DAY_IN_LEDGERS: u32 = 17_280;
/// Persistent entries touched by a call are extended towards this TTL...
const TTL_EXTEND_TO: u32 = 120 * DAY_IN_LEDGERS;
/// ...but only when the extension would be at least a day...
const TTL_MIN_EXTENSION: u32 = DAY_IN_LEDGERS;
/// ...and by at most 30 days per call, which bounds the rent any caller pays.
const TTL_MAX_EXTENSION: u32 = 30 * DAY_IN_LEDGERS;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    SplitNotFound = 1,
    EpochNotFound = 2,
    NoRecipients = 3,
    TooManyRecipients = 4,
    ZeroWeight = 5,
    WeightsDoNotSumToTotal = 6,
    DuplicatePayee = 7,
    SelfReference = 8,
    Locked = 9,
    InvalidAmount = 10,
    NothingReceived = 11,
    NotARecipient = 12,
    Overflow = 13,
}

/// Who receives a share of a split.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Payee {
    /// An account or contract address, settled with `collect`/`collect_to`.
    Account(Address),
    /// Another split in this contract, settled with `pull`.
    Split(u64),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Recipient {
    pub payee: Payee,
    /// Share of the split in parts per million of [`TOTAL_WEIGHT`].
    pub weight: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SplitInfo {
    pub owner: Address,
    pub locked: bool,
    /// The epoch new funds are credited to.
    pub epoch: u32,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    /// Instance: id the next created split receives.
    NextId,
    /// Persistent: `SplitInfo`.
    Split(u64),
    /// Persistent: `Vec<Recipient>` for `(split, epoch)`.
    Recipients(u64, u32),
    /// Persistent: `i128` total credited to `(split, epoch, token)`.
    Acc(u64, u32, Address),
    /// Persistent: `i128` value of `Acc` at the payee's last settlement for
    /// `(split, epoch, payee, token)`.
    Checkpoint(u64, u32, Payee, Address),
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SplitCreated {
    #[topic]
    pub split_id: u64,
    pub owner: Address,
    pub locked: bool,
    pub recipients: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RecipientsUpdated {
    #[topic]
    pub split_id: u64,
    pub epoch: u32,
    pub recipients: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SplitLocked {
    #[topic]
    pub split_id: u64,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OwnershipTransferred {
    #[topic]
    pub split_id: u64,
    pub previous_owner: Address,
    pub new_owner: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Deposited {
    #[topic]
    pub split_id: u64,
    #[topic]
    pub token: Address,
    pub from: Address,
    pub epoch: u32,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Pulled {
    #[topic]
    pub split_id: u64,
    #[topic]
    pub token: Address,
    pub parent_id: u64,
    pub parent_epoch: u32,
    pub epoch: u32,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Collected {
    #[topic]
    pub split_id: u64,
    #[topic]
    pub token: Address,
    pub account: Address,
    pub epoch: u32,
    pub amount: i128,
}

#[contract]
pub struct Upstream;

#[contractimpl]
impl Upstream {
    /// Create a split owned by `owner`. Returns its id.
    ///
    /// When `locked` is true the recipients can never change.
    pub fn create_split(env: Env, owner: Address, recipients: Vec<Recipient>, locked: bool) -> u64 {
        owner.require_auth();
        bump_instance(&env);

        let split_id: u64 = env.storage().instance().get(&DataKey::NextId).unwrap_or(0);
        validate_recipients(&env, split_id, split_id, &recipients);

        let info = SplitInfo {
            owner: owner.clone(),
            locked,
            epoch: 0,
        };
        set_persistent(&env, &DataKey::Split(split_id), &info);
        set_persistent(&env, &DataKey::Recipients(split_id, 0), &recipients);
        let next_id = split_id
            .checked_add(1)
            .unwrap_or_else(|| panic_with_error!(&env, Error::Overflow));
        env.storage().instance().set(&DataKey::NextId, &next_id);

        SplitCreated {
            split_id,
            owner,
            locked,
            recipients: recipients.len(),
        }
        .publish(&env);
        split_id
    }

    /// Replace the recipients of an unlocked split. Starts a new epoch, which is
    /// returned. Funds already credited stay with the previous epoch's recipients.
    pub fn update_recipients(env: Env, split_id: u64, recipients: Vec<Recipient>) -> u32 {
        bump_instance(&env);
        let mut info = load_split(&env, split_id);
        info.owner.require_auth();
        if info.locked {
            panic_with_error!(&env, Error::Locked);
        }
        validate_recipients(&env, split_id, next_split_id(&env), &recipients);

        info.epoch = info
            .epoch
            .checked_add(1)
            .unwrap_or_else(|| panic_with_error!(&env, Error::Overflow));
        set_persistent(
            &env,
            &DataKey::Recipients(split_id, info.epoch),
            &recipients,
        );
        set_persistent(&env, &DataKey::Split(split_id), &info);

        RecipientsUpdated {
            split_id,
            epoch: info.epoch,
            recipients: recipients.len(),
        }
        .publish(&env);
        info.epoch
    }

    /// Permanently freeze a split's recipients.
    pub fn lock(env: Env, split_id: u64) {
        bump_instance(&env);
        let mut info = load_split(&env, split_id);
        info.owner.require_auth();
        if !info.locked {
            info.locked = true;
            set_persistent(&env, &DataKey::Split(split_id), &info);
            SplitLocked { split_id }.publish(&env);
        }
    }

    /// Hand a split to a new owner. Both parties must authorize, so ownership can
    /// never be sent to an address that cannot act on it.
    pub fn transfer_ownership(env: Env, split_id: u64, new_owner: Address) {
        bump_instance(&env);
        let mut info = load_split(&env, split_id);
        info.owner.require_auth();
        new_owner.require_auth();

        let previous_owner = info.owner.clone();
        info.owner = new_owner.clone();
        set_persistent(&env, &DataKey::Split(split_id), &info);
        OwnershipTransferred {
            split_id,
            previous_owner,
            new_owner,
        }
        .publish(&env);
    }

    /// Deposit up to `amount` of `token` from `from` into a split. Returns the
    /// amount actually credited, measured as this contract's balance change so
    /// tokens that take a fee on transfer are accounted correctly.
    pub fn deposit(env: Env, from: Address, split_id: u64, token: Address, amount: i128) -> i128 {
        from.require_auth();
        bump_instance(&env);
        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        let info = load_split(&env, split_id);

        let this = env.current_contract_address();
        let client = token::TokenClient::new(&env, &token);
        let before = client.balance(&this);
        client.transfer(&from, MuxedAddress::from(&this), &amount);
        let after = client.balance(&this);

        let delta = after
            .checked_sub(before)
            .unwrap_or_else(|| panic_with_error!(&env, Error::Overflow));
        // Never credit more than was requested, whatever the token reports.
        let received = if delta > amount { amount } else { delta };
        if received <= 0 {
            panic_with_error!(&env, Error::NothingReceived);
        }

        credit(&env, split_id, info.epoch, &token, received);
        Deposited {
            split_id,
            token,
            from,
            epoch: info.epoch,
            amount: received,
        }
        .publish(&env);
        received
    }

    /// Move `child_id`'s share of `parent_id`'s `parent_epoch` into the child's
    /// current epoch. Anyone may call it. Returns the amount moved (0 if none).
    pub fn pull(
        env: Env,
        parent_id: u64,
        parent_epoch: u32,
        child_id: u64,
        token: Address,
    ) -> i128 {
        bump_instance(&env);
        let child = load_split(&env, child_id);
        let amount = settle(
            &env,
            parent_id,
            parent_epoch,
            &Payee::Split(child_id),
            &token,
        );
        if amount > 0 {
            credit(&env, child_id, child.epoch, &token, amount);
            Pulled {
                split_id: child_id,
                token,
                parent_id,
                parent_epoch,
                epoch: child.epoch,
                amount,
            }
            .publish(&env);
        }
        amount
    }

    /// Pay `account` its share of `split_id`'s `epoch`. Anyone may call it, and
    /// funds only ever go to `account` itself. Returns the amount paid (0 if none).
    pub fn collect(env: Env, split_id: u64, epoch: u32, account: Address, token: Address) -> i128 {
        bump_instance(&env);
        let to = MuxedAddress::from(&account);
        payout(&env, split_id, epoch, account, token, to)
    }

    /// Like `collect`, but `account` authorizes paying to a destination of its
    /// choice, e.g. a muxed exchange deposit address.
    pub fn collect_to(
        env: Env,
        split_id: u64,
        epoch: u32,
        account: Address,
        token: Address,
        to: MuxedAddress,
    ) -> i128 {
        account.require_auth();
        bump_instance(&env);
        payout(&env, split_id, epoch, account, token, to)
    }

    pub fn get_split(env: Env, split_id: u64) -> SplitInfo {
        load_split(&env, split_id)
    }

    pub fn get_recipients(env: Env, split_id: u64, epoch: u32) -> Vec<Recipient> {
        load_recipients(&env, split_id, epoch)
    }

    /// Total amount of `token` ever credited to `(split_id, epoch)`.
    pub fn get_received(env: Env, split_id: u64, epoch: u32, token: Address) -> i128 {
        load_split(&env, split_id);
        env.storage()
            .persistent()
            .get(&DataKey::Acc(split_id, epoch, token))
            .unwrap_or(0)
    }

    /// Amount `payee` could settle right now from `(split_id, epoch)`.
    pub fn claimable(env: Env, split_id: u64, epoch: u32, payee: Payee, token: Address) -> i128 {
        let (owed, _) = owed(&env, split_id, epoch, &payee, &token);
        owed
    }

    pub fn next_split_id(env: Env) -> u64 {
        next_split_id(&env)
    }
}

fn next_split_id(env: &Env) -> u64 {
    env.storage().instance().get(&DataKey::NextId).unwrap_or(0)
}

/// `self_id` is the split being configured; `next_id` bounds which splits exist.
fn validate_recipients(env: &Env, self_id: u64, next_id: u64, recipients: &Vec<Recipient>) {
    let len = recipients.len();
    if len == 0 {
        panic_with_error!(env, Error::NoRecipients);
    }
    if len > MAX_RECIPIENTS {
        panic_with_error!(env, Error::TooManyRecipients);
    }

    let this = env.current_contract_address();
    let mut total: u64 = 0;
    for i in 0..len {
        let r = recipients.get_unchecked(i);
        if r.weight == 0 {
            panic_with_error!(env, Error::ZeroWeight);
        }
        total += r.weight as u64;

        match &r.payee {
            Payee::Account(address) => {
                if *address == this {
                    panic_with_error!(env, Error::SelfReference);
                }
            }
            Payee::Split(id) => {
                if *id == self_id {
                    panic_with_error!(env, Error::SelfReference);
                }
                if *id >= next_id {
                    panic_with_error!(env, Error::SplitNotFound);
                }
            }
        }

        for j in (i + 1)..len {
            if recipients.get_unchecked(j).payee == r.payee {
                panic_with_error!(env, Error::DuplicatePayee);
            }
        }
    }
    if total != TOTAL_WEIGHT as u64 {
        panic_with_error!(env, Error::WeightsDoNotSumToTotal);
    }
}

fn payout(
    env: &Env,
    split_id: u64,
    epoch: u32,
    account: Address,
    token: Address,
    to: MuxedAddress,
) -> i128 {
    let amount = settle(
        env,
        split_id,
        epoch,
        &Payee::Account(account.clone()),
        &token,
    );
    if amount > 0 {
        // State is already settled above; the transfer is the last step.
        token::TokenClient::new(env, &token).transfer(
            &env.current_contract_address(),
            &to,
            &amount,
        );
        Collected {
            split_id,
            token,
            account,
            epoch,
            amount,
        }
        .publish(env);
    }
    amount
}

/// Returns `(owed, acc)` for `payee` in `(split_id, epoch)` without changing state.
fn owed(env: &Env, split_id: u64, epoch: u32, payee: &Payee, token: &Address) -> (i128, i128) {
    load_split(env, split_id);
    let recipients = load_recipients(env, split_id, epoch);
    let weight = weight_of(env, &recipients, payee) as i128;

    let acc: i128 = env
        .storage()
        .persistent()
        .get(&DataKey::Acc(split_id, epoch, token.clone()))
        .unwrap_or(0);
    let checkpoint: i128 = env
        .storage()
        .persistent()
        .get(&DataKey::Checkpoint(
            split_id,
            epoch,
            payee.clone(),
            token.clone(),
        ))
        .unwrap_or(0);

    let total = TOTAL_WEIGHT as i128;
    let entitled_now = mul_div_floor(env, weight, acc, total);
    let entitled_before = mul_div_floor(env, weight, checkpoint, total);
    (entitled_now - entitled_before, acc)
}

/// Settles `payee` in `(split_id, epoch)`: advances its checkpoint and returns
/// the amount it is owed. The caller must deliver that amount.
fn settle(env: &Env, split_id: u64, epoch: u32, payee: &Payee, token: &Address) -> i128 {
    let (amount, acc) = owed(env, split_id, epoch, payee, token);
    if amount > 0 {
        set_persistent(
            env,
            &DataKey::Checkpoint(split_id, epoch, payee.clone(), token.clone()),
            &acc,
        );
    }
    amount
}

fn credit(env: &Env, split_id: u64, epoch: u32, token: &Address, amount: i128) {
    let key = DataKey::Acc(split_id, epoch, token.clone());
    let acc: i128 = env.storage().persistent().get(&key).unwrap_or(0);
    let acc = acc
        .checked_add(amount)
        .unwrap_or_else(|| panic_with_error!(env, Error::Overflow));
    // Keep `weight * acc` representable so settlement can never overflow.
    if acc.checked_mul(TOTAL_WEIGHT as i128).is_none() {
        panic_with_error!(env, Error::Overflow);
    }
    set_persistent(env, &key, &acc);
}

fn weight_of(env: &Env, recipients: &Vec<Recipient>, payee: &Payee) -> u32 {
    for r in recipients.iter() {
        if r.payee == *payee {
            return r.weight;
        }
    }
    panic_with_error!(env, Error::NotARecipient)
}

fn mul_div_floor(env: &Env, a: i128, b: i128, denominator: i128) -> i128 {
    // Both factors are non-negative, so truncating division is floor division.
    a.checked_mul(b)
        .unwrap_or_else(|| panic_with_error!(env, Error::Overflow))
        / denominator
}

fn load_split(env: &Env, split_id: u64) -> SplitInfo {
    let key = DataKey::Split(split_id);
    let info = env
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or_else(|| panic_with_error!(env, Error::SplitNotFound));
    bump_persistent(env, &key);
    info
}

fn load_recipients(env: &Env, split_id: u64, epoch: u32) -> Vec<Recipient> {
    let key = DataKey::Recipients(split_id, epoch);
    let recipients = env
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or_else(|| panic_with_error!(env, Error::EpochNotFound));
    bump_persistent(env, &key);
    recipients
}

fn set_persistent<V: soroban_sdk::IntoVal<Env, soroban_sdk::Val>>(
    env: &Env,
    key: &DataKey,
    value: &V,
) {
    env.storage().persistent().set(key, value);
    bump_persistent(env, key);
}

fn bump_persistent(env: &Env, key: &DataKey) {
    env.storage().persistent().extend_ttl_with_limits(
        key,
        TTL_EXTEND_TO,
        TTL_MIN_EXTENSION,
        TTL_MAX_EXTENSION,
    );
}

fn bump_instance(env: &Env) {
    env.storage().instance().extend_ttl_with_limits(
        TTL_EXTEND_TO,
        TTL_MIN_EXTENSION,
        TTL_MAX_EXTENSION,
    );
}

#[cfg(test)]
mod test;
