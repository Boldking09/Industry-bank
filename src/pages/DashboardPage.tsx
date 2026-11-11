import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getSpendingTrend } from "../data/seed";
import {
  formatCurrency,
  formatDate,
  formatSignedCurrency,
} from "../lib/format";
import { useAuth } from "../state/AuthContext";
import { useBank } from "../state/BankContext";

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
            {accounts.map((account) => (
              <article key={account.id} className="card account">
                <div className="account__top">
                  <span className={`dot dot--${account.kind}`} aria-hidden="true" />
                  <span className="account__name">{account.name}</span>
                  <span className="account__mask">••{account.mask}</span>
                </div>
                <p className="account__balance">{formatCurrency(account.balanceCents)}</p>
                <p className="account__label">
                  {account.kind === "credit" ? "Current balance" : "Available balance"}
                </p>
              </article>
            ))}
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
                onClick={() => setNotice("Deposits are disabled in this demo.")}
              >
                <span className="quick__icon" aria-hidden="true">
                  +
                </span>
                Deposit a check
              </button>
              <button
                type="button"
                className="quick__btn"
                onClick={() => setNotice("Bill pay is disabled in this demo.")}
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
              <h2 className="section-title">Demo mode</h2>
            </div>
            <p className="side-note">
              Balances and activity are stored locally in your browser. Sending a
              transfer updates the mock data and can be reset by clearing site data.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
