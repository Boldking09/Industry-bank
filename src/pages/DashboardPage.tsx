import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getSpendingTrend } from "../data/seed";
import {
  formatAccountNumber,
  formatCurrency,
  formatDate,
  formatRoutingNumber,
  formatSignedCurrency,
} from "../lib/format";
import { useAuth } from "../state/AuthContext";
import { useBank } from "../state/BankContext";

function AccountKindIcon({ kind }: { kind: string }) {
  if (kind === "savings") {
    return (
      <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true">
        <path
          d="M3 8.2 10 4l7 4.2M4.3 8.2h11.4M5.2 8.2v6.3M8.4 8.2v6.3M11.6 8.2v6.3M14.8 8.2v6.3M3.4 14.5h13.2M2.8 16.2h14.4"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (kind === "credit") {
    return (
      <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true">
        <rect x="2.4" y="4.6" width="15.2" height="10.8" rx="2" stroke="currentColor" strokeWidth="1.4" />
        <path d="M2.4 8.4h15.2" stroke="currentColor" strokeWidth="1.4" />
        <path d="M5.4 12.4h3.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true">
      <path
        d="M3 8.4 10 4.2l7 4.2M4.4 8.4v6.2M8 8.4v6.2M12 8.4v6.2M15.6 8.4v6.2M2.8 14.6h14.4M2.4 16.3h15.2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HashIcon() {
  return (
    <svg viewBox="0 0 20 20" width="13" height="13" fill="none" aria-hidden="true">
      <path
        d="M7.2 3.4 5.8 16.6M12.6 3.4l-1.4 13.2M3.8 7.4h12.4M3.2 12.6h12.4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function RouteIcon() {
  return (
    <svg viewBox="0 0 20 20" width="13" height="13" fill="none" aria-hidden="true">
      <circle cx="6" cy="5" r="2" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="14" cy="15" r="2" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M8 5h4.2a2 2 0 0 1 2 2v1.4a2 2 0 0 1-2 2H7.8a2 2 0 0 0-2 2V13"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function greetingForHour(hour: number): string {
  if (hour < 12) {
    return "Good morning";
  }
  if (hour < 18) {
    return "Good afternoon";
  }
  return "Good evening";
}

export default function DashboardPage() {
  const { session } = useAuth();
  const { accounts, transactions, availableCents } = useBank();
  const [notice, setNotice] = useState("");

  const trend = useMemo(() => getSpendingTrend(), []);
  const maxTrend = useMemo(
    () => Math.max(...trend.map((point) => point.amountCents)),
    [trend],
  );
  const recent = transactions.slice(0, 6);
  const firstName = session?.name.split(" ")[0] ?? "there";
  const greeting = greetingForHour(new Date().getHours());

  useEffect(() => {
    if (!notice) {
      return;
    }
    const timer = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  return (
    <>
      <header className="page__header">
        <div>
          <p className="greeting">Overview</p>
          <h1 className="page__title">
            {greeting}, {firstName}
          </h1>
          <p className="page__sub">Here is how things look across your accounts today.</p>
        </div>
        <Link to="/transfer" className="btn btn--primary">
          Send money
        </Link>
      </header>

      <div className="dash">
        <div className="dash__main">
          <section className="hero">
            <div className="hero__body">
              <p className="hero__label">Total available balance</p>
              <p className="hero__amount">{formatCurrency(availableCents)}</p>
              <p className="hero__meta">
                <span className="delta">+2.4%</span> from last month
              </p>
              <div className="hero__actions">
                <Link to="/transfer" className="btn btn--light">
                  Transfer money
                </Link>
                <a href="#activity" className="btn btn--outline-light">
                  View activity
                </a>
              </div>
            </div>
            <div className="hero__art" aria-hidden="true">
              <div className="mini-card">
                <span className="mini-card__chip" />
                <span className="mini-card__num">•••• 4821</span>
                <span className="mini-card__brand">Industry</span>
              </div>
            </div>
          </section>

          <section className="accounts" aria-label="Accounts">
            {accounts.map((account) => {
              const isChecking = account.kind === "checking";
              return (
                <article
                  key={account.id}
                  className={
                    isChecking
                      ? "card account account--checking"
                      : "card account"
                  }
                >
                  <div className="account__top">
                    <span
                      className={`account__icon account__icon--${account.kind}`}
                      aria-hidden="true"
                    >
                      <AccountKindIcon kind={account.kind} />
                    </span>
                    <span className="account__name">{account.name}</span>
                    <span className="account__mask">••{account.mask}</span>
                  </div>
                  <p className="account__balance">
                    {formatCurrency(account.balanceCents)}
                  </p>
                  <p className="account__label">
                    {account.kind === "credit"
                      ? "Current balance"
                      : "Available balance"}
                  </p>
                  {isChecking && account.accountNumber ? (
                    <div
                      className="account__receive"
                      aria-label="Details for receiving money"
                    >
                      <div className="account__receive-head">
                        <span>Direct deposit details</span>
                        <Link to="/profile" className="account__receive-link">
                          Manage
                        </Link>
                      </div>
                      <div className="account__receive-grid">
                        <div className="account__receive-item">
                          <span className="account__receive-label">
                            <HashIcon /> Account number
                          </span>
                          <span className="account__receive-value">
                            {formatAccountNumber(account.accountNumber)}
                          </span>
                        </div>
                        <div className="account__receive-item">
                          <span className="account__receive-label">
                            <RouteIcon /> Routing number
                          </span>
                          <span className="account__receive-value">
                            {formatRoutingNumber(account.routingNumber)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </section>

          <section id="activity" className="card card--pad">
            <div className="section-head">
              <h2 className="section-title">Recent activity</h2>
              <Link to="/transfer" className="section-link">
                Send money
              </Link>
            </div>
            <ul className="txns">
              {recent.map((transaction) => {
                const account = accounts.find(
                  (item) => item.id === transaction.accountId,
                );
                return (
                  <li key={transaction.id} className="txn">
                    <span className="txn__icon" aria-hidden="true">
                      {transaction.merchant.charAt(0)}
                    </span>
                    <div className="txn__main">
                      <span className="txn__merchant">{transaction.merchant}</span>
                      <span className="txn__meta">
                        {transaction.category}
                        {account ? ` · ••${account.mask}` : ""} ·{" "}
                        {formatDate(transaction.date)}
                      </span>
                    </div>
                    <span
                      className={
                        transaction.amountCents >= 0
                          ? "txn__amount txn__amount--pos"
                          : "txn__amount"
                      }
                    >
                      {formatSignedCurrency(transaction.amountCents)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <aside className="dash__side">
          <section className="card card--pad">
            <div className="section-head">
              <h2 className="section-title">Quick actions</h2>
            </div>
            <div className="quick">
              <Link to="/transfer" className="quick__btn">
                <span className="quick__icon" aria-hidden="true">
                  →
                </span>
                Transfer money
              </Link>
              <button
                type="button"
                className="quick__btn"
                onClick={() => setNotice("Deposits are currently unavailable.")}
              >
                <span className="quick__icon" aria-hidden="true">
                  +
                </span>
                Deposit a check
              </button>
              <button
                type="button"
                className="quick__btn"
                onClick={() => setNotice("Bill pay is currently unavailable.")}
              >
                <span className="quick__icon" aria-hidden="true">
                  ✓
                </span>
                Pay a bill
              </button>
            </div>
            {notice ? (
              <p className="notice" role="status">
                {notice}
              </p>
            ) : null}
          </section>

          <section className="card card--pad">
            <div className="section-head">
              <h2 className="section-title">Spending trend</h2>
              <span className="section-link">Last 6 months</span>
            </div>
            <div
              className="chart__bars"
              role="img"
              aria-label="Monthly spending over the last six months"
            >
              {trend.map((point) => (
                <div key={point.label} className="chart__bar">
                  <span
                    style={{
                      height: `${Math.round((point.amountCents / maxTrend) * 100)}%`,
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="chart__labels" aria-hidden="true">
              {trend.map((point) => (
                <span key={point.label}>{point.label}</span>
              ))}
            </div>
            <div className="chart__foot">
              <span>
                This month <strong>{formatCurrency(trend[trend.length - 1].amountCents)}</strong>
              </span>
              <span>
                Average{" "}
                <strong>
                  {formatCurrency(
                    Math.round(
                      trend.reduce((total, point) => total + point.amountCents, 0) /
                        trend.length,
                    ),
                  )}
                </strong>
              </span>
            </div>
          </section>

          <section className="card card--pad">
            <div className="section-head">
              <h2 className="section-title">Live data</h2>
            </div>
            <p className="side-note">
              Balances and activity live in your Supabase database and update live
              across devices. Sending a transfer moves real rows between accounts, so
              a second signed-in person sees the change instantly.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
