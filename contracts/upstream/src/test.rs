#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger as _, MuxedAddress as _},
    token::{StellarAssetClient, TokenClient},
    vec, Address, Env, MuxedAddress, Vec,
};

struct Setup {
    env: Env,
    splits: UpstreamClient<'static>,
    token: TokenClient<'static>,
    funder: Address,
}

/// Contract errors surface through `try_*` clients as `soroban_sdk::Error`.
fn err(e: Error) -> soroban_sdk::Error {
    e.into()
}

fn setup() -> Setup {
    let env = Env::default();
    // Mainnet state archival settings, so TTL extension costs are realistic.
    env.ledger().set_min_persistent_entry_ttl(2_073_600);
    env.ledger().set_min_temp_entry_ttl(17_280);
    env.ledger().set_max_entry_ttl(3_110_400);
    env.mock_all_auths();

    let contract_id = env.register(Upstream, ());
    let splits = UpstreamClient::new(&env, &contract_id);

    let issuer = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(issuer);
    let token = TokenClient::new(&env, &sac.address());

    let funder = Address::generate(&env);
    StellarAssetClient::new(&env, &sac.address()).mint(&funder, &1_000_000_000);

    Setup {
        env,
        splits,
        token,
        funder,
    }
}

fn account(env: &Env, address: &Address, weight: u32) -> Recipient {
    let _ = env;
    Recipient {
        payee: Payee::Account(address.clone()),
        weight,
    }
}

fn nested(split_id: u64, weight: u32) -> Recipient {
    Recipient {
        payee: Payee::Split(split_id),
        weight,
    }
}

fn new_token(env: &Env, to: &Address, amount: i128) -> TokenClient<'static> {
    let sac = env.register_stellar_asset_contract_v2(Address::generate(env));
    StellarAssetClient::new(env, &sac.address()).mint(to, &amount);
    TokenClient::new(env, &sac.address())
}

#[test]
fn deposit_and_collect_pays_each_recipient_its_weight() {
    let s = setup();
    let (a, b, c) = (
        Address::generate(&s.env),
        Address::generate(&s.env),
        Address::generate(&s.env),
    );
    let recipients = vec![
        &s.env,
        account(&s.env, &a, 500_000),
        account(&s.env, &b, 300_000),
        account(&s.env, &c, 200_000),
    ];
    let owner = Address::generate(&s.env);
    let id = s.splits.create_split(&owner, &recipients, &false);

    assert_eq!(
        s.splits.deposit(&s.funder, &id, &s.token.address, &1_000),
        1_000
    );
    assert_eq!(s.token.balance(&s.splits.address), 1_000);
    assert_eq!(
        s.splits
            .claimable(&id, &0, &Payee::Account(b.clone()), &s.token.address),
        300
    );

    assert_eq!(s.splits.collect(&id, &0, &a, &s.token.address), 500);
    assert_eq!(s.splits.collect(&id, &0, &b, &s.token.address), 300);
    assert_eq!(s.splits.collect(&id, &0, &c, &s.token.address), 200);
    assert_eq!(s.token.balance(&a), 500);
    assert_eq!(s.token.balance(&b), 300);
    assert_eq!(s.token.balance(&c), 200);
    assert_eq!(s.token.balance(&s.splits.address), 0);

    // Settled: a second collect pays nothing.
    assert_eq!(s.splits.collect(&id, &0, &a, &s.token.address), 0);

    // New funds accrue on top of the checkpoint.
    s.splits.deposit(&s.funder, &id, &s.token.address, &2_000);
    assert_eq!(s.splits.collect(&id, &0, &a, &s.token.address), 1_000);
    assert_eq!(s.splits.get_received(&id, &0, &s.token.address), 3_000);
}

#[test]
fn rounding_never_overpays_and_never_compounds() {
    let s = setup();
    let (a, b, c) = (
        Address::generate(&s.env),
        Address::generate(&s.env),
        Address::generate(&s.env),
    );
    let recipients = vec![
        &s.env,
        account(&s.env, &a, 333_333),
        account(&s.env, &b, 333_333),
        account(&s.env, &c, 333_334),
    ];
    let id = s
        .splits
        .create_split(&Address::generate(&s.env), &recipients, &false);

    // Many tiny deposits, collecting after each one: per-deposit floors would
    // lose a unit every time, cumulative settlement must not.
    let mut deposited = 0i128;
    for _ in 0..30 {
        s.splits.deposit(&s.funder, &id, &s.token.address, &10);
        deposited += 10;
        for who in [&a, &b, &c] {
            s.splits.collect(&id, &0, who, &s.token.address);
        }
    }

    let paid = s.token.balance(&a) + s.token.balance(&b) + s.token.balance(&c);
    assert!(paid <= deposited);
    // Each recipient loses at most one base unit over the whole epoch.
    assert!(deposited - paid <= 3, "dust {}", deposited - paid);
    assert_eq!(s.token.balance(&s.splits.address), deposited - paid);
    assert_eq!(s.token.balance(&c), 100); // 333_334 * 300 / 1_000_000 = 100.0002
}

#[test]
fn collect_needs_no_auth_but_only_pays_the_recipient() {
    let s = setup();
    let a = Address::generate(&s.env);
    let id = s.splits.create_split(
        &Address::generate(&s.env),
        &vec![&s.env, account(&s.env, &a, 1_000_000)],
        &false,
    );
    s.splits.deposit(&s.funder, &id, &s.token.address, &700);

    s.env.set_auths(&[]);
    assert_eq!(s.splits.collect(&id, &0, &a, &s.token.address), 700);
    assert_eq!(s.token.balance(&a), 700);
}

#[test]
fn collect_to_requires_the_recipients_auth() {
    let s = setup();
    let a = Address::generate(&s.env);
    let elsewhere = MuxedAddress::from(&Address::generate(&s.env));
    let id = s.splits.create_split(
        &Address::generate(&s.env),
        &vec![&s.env, account(&s.env, &a, 1_000_000)],
        &false,
    );
    s.splits.deposit(&s.funder, &id, &s.token.address, &400);

    s.env.set_auths(&[]);
    assert!(s
        .splits
        .try_collect_to(&id, &0, &a, &s.token.address, &elsewhere)
        .is_err());

    s.env.mock_all_auths();
    assert_eq!(
        s.splits
            .collect_to(&id, &0, &a, &s.token.address, &elsewhere),
        400
    );
    assert_eq!(s.token.balance(&elsewhere.address()), 400);
    assert_eq!(s.token.balance(&a), 0);
}

#[test]
fn a_recipient_without_a_trustline_only_blocks_itself() {
    let s = setup();
    let healthy = Address::generate(&s.env);
    // A classic G-account that never opened a trustline to the asset.
    let untrusted = MuxedAddress::generate(&s.env).address();
    let id = s.splits.create_split(
        &Address::generate(&s.env),
        &vec![
            &s.env,
            account(&s.env, &healthy, 500_000),
            account(&s.env, &untrusted, 500_000),
        ],
        &false,
    );
    s.splits.deposit(&s.funder, &id, &s.token.address, &1_000);

    // The failed payout rolls back entirely: its share stays claimable.
    assert!(s
        .splits
        .try_collect(&id, &0, &untrusted, &s.token.address)
        .is_err());
    assert_eq!(
        s.splits.claimable(
            &id,
            &0,
            &Payee::Account(untrusted.clone()),
            &s.token.address
        ),
        500
    );

    // Everyone else is unaffected.
    assert_eq!(s.splits.collect(&id, &0, &healthy, &s.token.address), 500);
    assert_eq!(s.token.balance(&s.splits.address), 500);
}

#[test]
fn updating_recipients_starts_a_new_epoch_and_keeps_old_funds_with_old_recipients() {
    let s = setup();
    let (a, b) = (Address::generate(&s.env), Address::generate(&s.env));
    let owner = Address::generate(&s.env);
    let id = s.splits.create_split(
        &owner,
        &vec![&s.env, account(&s.env, &a, 1_000_000)],
        &false,
    );

    s.splits.deposit(&s.funder, &id, &s.token.address, &100);
    assert_eq!(
        s.splits
            .update_recipients(&id, &vec![&s.env, account(&s.env, &b, 1_000_000)]),
        1
    );
    s.splits.deposit(&s.funder, &id, &s.token.address, &250);

    assert_eq!(s.splits.get_split(&id).epoch, 1);
    assert_eq!(s.splits.collect(&id, &0, &a, &s.token.address), 100);
    assert_eq!(s.splits.collect(&id, &1, &b, &s.token.address), 250);
    assert_eq!(
        s.splits.try_collect(&id, &1, &a, &s.token.address),
        Err(Ok(err(Error::NotARecipient)))
    );
    assert_eq!(
        s.splits.try_get_recipients(&id, &2),
        Err(Ok(err(Error::EpochNotFound)))
    );
}

#[test]
fn locked_split_cannot_be_updated() {
    let s = setup();
    let a = Address::generate(&s.env);
    let recipients = vec![&s.env, account(&s.env, &a, 1_000_000)];

    let id = s
        .splits
        .create_split(&Address::generate(&s.env), &recipients, &false);
    s.splits.lock(&id);
    assert!(s.splits.get_split(&id).locked);
    assert_eq!(
        s.splits.try_update_recipients(&id, &recipients),
        Err(Ok(err(Error::Locked)))
    );

    let born_locked = s
        .splits
        .create_split(&Address::generate(&s.env), &recipients, &true);
    assert_eq!(
        s.splits.try_update_recipients(&born_locked, &recipients),
        Err(Ok(err(Error::Locked)))
    );
}

#[test]
fn owner_actions_require_owner_auth() {
    let s = setup();
    let a = Address::generate(&s.env);
    let recipients = vec![&s.env, account(&s.env, &a, 1_000_000)];
    let id = s
        .splits
        .create_split(&Address::generate(&s.env), &recipients, &false);

    s.env.set_auths(&[]);
    assert!(s.splits.try_update_recipients(&id, &recipients).is_err());
    assert!(s.splits.try_lock(&id).is_err());
    assert!(s
        .splits
        .try_transfer_ownership(&id, &Address::generate(&s.env))
        .is_err());
    assert!(s
        .splits
        .try_create_split(&Address::generate(&s.env), &recipients, &false)
        .is_err());
    assert!(s
        .splits
        .try_deposit(&s.funder, &id, &s.token.address, &1)
        .is_err());
}

#[test]
fn transfer_ownership_moves_control() {
    let s = setup();
    let a = Address::generate(&s.env);
    let recipients = vec![&s.env, account(&s.env, &a, 1_000_000)];
    let id = s
        .splits
        .create_split(&Address::generate(&s.env), &recipients, &false);

    let new_owner = Address::generate(&s.env);
    s.splits.transfer_ownership(&id, &new_owner);
    assert_eq!(s.splits.get_split(&id).owner, new_owner);
}

#[test]
fn nested_splits_route_a_share_to_dependencies() {
    let s = setup();
    let (maintainer, lib_one, lib_two) = (
        Address::generate(&s.env),
        Address::generate(&s.env),
        Address::generate(&s.env),
    );

    // A dependency list: two libraries, 60/40.
    let deps = s.splits.create_split(
        &Address::generate(&s.env),
        &vec![
            &s.env,
            account(&s.env, &lib_one, 600_000),
            account(&s.env, &lib_two, 400_000),
        ],
        &true,
    );
    // The app keeps 90% and routes 10% to its dependencies.
    let app = s.splits.create_split(
        &Address::generate(&s.env),
        &vec![
            &s.env,
            account(&s.env, &maintainer, 900_000),
            nested(deps, 100_000),
        ],
        &false,
    );

    s.splits.deposit(&s.funder, &app, &s.token.address, &10_000);
    assert_eq!(
        s.splits
            .claimable(&app, &0, &Payee::Split(deps), &s.token.address),
        1_000
    );

    // Anyone can push the share one hop down.
    s.env.set_auths(&[]);
    assert_eq!(s.splits.pull(&app, &0, &deps, &s.token.address), 1_000);
    assert_eq!(s.splits.pull(&app, &0, &deps, &s.token.address), 0);
    assert_eq!(s.splits.get_received(&deps, &0, &s.token.address), 1_000);

    assert_eq!(
        s.splits.collect(&app, &0, &maintainer, &s.token.address),
        9_000
    );
    assert_eq!(s.splits.collect(&deps, &0, &lib_one, &s.token.address), 600);
    assert_eq!(s.splits.collect(&deps, &0, &lib_two, &s.token.address), 400);
    assert_eq!(s.token.balance(&s.splits.address), 0);
}

#[test]
fn pull_rejects_a_split_that_is_not_a_recipient() {
    let s = setup();
    let a = Address::generate(&s.env);
    let recipients = vec![&s.env, account(&s.env, &a, 1_000_000)];
    let first = s
        .splits
        .create_split(&Address::generate(&s.env), &recipients, &false);
    let second = s
        .splits
        .create_split(&Address::generate(&s.env), &recipients, &false);

    assert_eq!(
        s.splits.try_pull(&first, &0, &second, &s.token.address),
        Err(Ok(err(Error::NotARecipient)))
    );
}

#[test]
fn recipients_are_validated() {
    let s = setup();
    let owner = Address::generate(&s.env);
    let (a, b) = (Address::generate(&s.env), Address::generate(&s.env));
    let create =
        |recipients: &Vec<Recipient>| s.splits.try_create_split(&owner, recipients, &false);

    assert_eq!(create(&Vec::new(&s.env)), Err(Ok(err(Error::NoRecipients))));
    assert_eq!(
        create(&vec![
            &s.env,
            account(&s.env, &a, 0),
            account(&s.env, &b, 1_000_000)
        ]),
        Err(Ok(err(Error::ZeroWeight)))
    );
    assert_eq!(
        create(&vec![
            &s.env,
            account(&s.env, &a, 500_000),
            account(&s.env, &b, 400_000)
        ]),
        Err(Ok(err(Error::WeightsDoNotSumToTotal)))
    );
    assert_eq!(
        create(&vec![
            &s.env,
            account(&s.env, &a, 500_000),
            account(&s.env, &a, 500_000)
        ]),
        Err(Ok(err(Error::DuplicatePayee)))
    );
    assert_eq!(
        create(&vec![&s.env, account(&s.env, &s.splits.address, 1_000_000)]),
        Err(Ok(err(Error::SelfReference)))
    );
    // The next id is this split's own id.
    assert_eq!(
        create(&vec![&s.env, nested(0, 1_000_000)]),
        Err(Ok(err(Error::SelfReference)))
    );

    let first = s.splits.create_split(
        &owner,
        &vec![&s.env, account(&s.env, &a, 1_000_000)],
        &false,
    );
    assert_eq!(
        create(&vec![&s.env, nested(7, 1_000_000)]),
        Err(Ok(err(Error::SplitNotFound)))
    );
    assert_eq!(
        s.splits
            .try_update_recipients(&first, &vec![&s.env, nested(first, 1_000_000)]),
        Err(Ok(err(Error::SelfReference)))
    );

    let mut too_many = Vec::new(&s.env);
    for _ in 0..(MAX_RECIPIENTS + 1) {
        too_many.push_back(account(&s.env, &Address::generate(&s.env), 1));
    }
    assert_eq!(create(&too_many), Err(Ok(err(Error::TooManyRecipients))));
}

#[test]
fn deposits_are_validated() {
    let s = setup();
    let a = Address::generate(&s.env);
    let id = s.splits.create_split(
        &Address::generate(&s.env),
        &vec![&s.env, account(&s.env, &a, 1_000_000)],
        &false,
    );

    assert_eq!(
        s.splits.try_deposit(&s.funder, &id, &s.token.address, &0),
        Err(Ok(err(Error::InvalidAmount)))
    );
    assert_eq!(
        s.splits.try_deposit(&s.funder, &id, &s.token.address, &-5),
        Err(Ok(err(Error::InvalidAmount)))
    );
    assert_eq!(
        s.splits.try_deposit(&s.funder, &99, &s.token.address, &5),
        Err(Ok(err(Error::SplitNotFound)))
    );
}

#[test]
fn tokens_are_accounted_separately() {
    let s = setup();
    let (a, b) = (Address::generate(&s.env), Address::generate(&s.env));
    let id = s.splits.create_split(
        &Address::generate(&s.env),
        &vec![
            &s.env,
            account(&s.env, &a, 250_000),
            account(&s.env, &b, 750_000),
        ],
        &false,
    );
    let other = new_token(&s.env, &s.funder, 1_000_000);

    s.splits.deposit(&s.funder, &id, &s.token.address, &400);
    s.splits.deposit(&s.funder, &id, &other.address, &8_000);

    assert_eq!(s.splits.collect(&id, &0, &a, &s.token.address), 100);
    assert_eq!(s.splits.collect(&id, &0, &a, &other.address), 2_000);
    assert_eq!(s.splits.collect(&id, &0, &b, &other.address), 6_000);
    assert_eq!(
        s.splits
            .claimable(&id, &0, &Payee::Account(b.clone()), &s.token.address),
        300
    );
    assert_eq!(other.balance(&s.splits.address), 0);
    assert_eq!(s.token.balance(&s.splits.address), 300);
}

/// Prints mainnet resource and fee estimates for the main entrypoints on a
/// full-size split. Run with `cargo test cost_report -- --ignored --nocapture`.
#[test]
#[ignore]
fn cost_report() {
    let s = setup();
    let report = |label: &str| {
        std::println!("== {label}");
        std::println!("{:#?}", s.env.cost_estimate().resources());
        let fee = s.env.cost_estimate().fee();
        std::println!("{:#?}", fee);
        // The SDK prices rent at 12,000 stroops/KB as a conservative overestimate;
        // live mainnet currently charges the 1,000 stroops/KB floor.
        let rent = fee.persistent_entry_rent + fee.temporary_entry_rent;
        let live = fee.total - rent + rent / 12;
        std::println!(
            "mainnet_estimate: {} stroops = {:.4} XLM",
            live,
            live as f64 / 1e7
        );
    };

    let per = TOTAL_WEIGHT / MAX_RECIPIENTS;
    let deps = s.splits.create_split(
        &Address::generate(&s.env),
        &vec![
            &s.env,
            account(&s.env, &Address::generate(&s.env), 1_000_000),
        ],
        &false,
    );
    let mut recipients = Vec::new(&s.env);
    let mut last = Address::generate(&s.env);
    recipients.push_back(nested(deps, per));
    for _ in 1..MAX_RECIPIENTS {
        last = Address::generate(&s.env);
        recipients.push_back(account(&s.env, &last, per));
    }

    let id = s
        .splits
        .create_split(&Address::generate(&s.env), &recipients, &false);
    report("create_split (50 recipients)");

    s.splits
        .deposit(&s.funder, &id, &s.token.address, &1_000_000);
    report("deposit (first, creates acc entry)");

    s.splits
        .deposit(&s.funder, &id, &s.token.address, &1_000_000);
    report("deposit (subsequent)");

    s.splits.collect(&id, &0, &last, &s.token.address);
    report("collect (last of 50 recipients)");

    s.splits.pull(&id, &0, &deps, &s.token.address);
    report("pull (nested split)");

    s.splits.update_recipients(&id, &recipients);
    report("update_recipients (50 recipients)");

    // Isolation probes: which TTL extensions drive rent?
    s.splits.next_split_id();
    report("probe: next_split_id (no storage bumps)");
    s.splits.get_split(&deps);
    report("probe: get_split (split entry bump only)");
    s.splits.get_split(&deps);
    report("probe: get_split again (same ledger)");
    s.splits.lock(&deps);
    report("probe: lock (split + instance bump)");
    s.splits.lock(&deps);
    report("probe: lock again, already locked (split + instance bump, no writes)");
}

#[test]
fn a_full_split_stays_within_network_limits() {
    // Env::default() enforces mainnet resource limits for every invocation.
    let s = setup();
    let per = TOTAL_WEIGHT / MAX_RECIPIENTS;
    let mut recipients = Vec::new(&s.env);
    let mut accounts = std::vec::Vec::new();
    for _ in 0..MAX_RECIPIENTS {
        let who = Address::generate(&s.env);
        recipients.push_back(account(&s.env, &who, per));
        accounts.push(who);
    }
    let id = s
        .splits
        .create_split(&Address::generate(&s.env), &recipients, &false);
    s.splits.deposit(
        &s.funder,
        &id,
        &s.token.address,
        &(MAX_RECIPIENTS as i128 * 1_000),
    );

    // The last recipient is the most expensive lookup.
    let last = accounts.last().unwrap();
    assert_eq!(s.splits.collect(&id, &0, last, &s.token.address), 1_000);
    s.splits.update_recipients(&id, &recipients);
}
