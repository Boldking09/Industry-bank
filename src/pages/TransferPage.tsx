import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { formatCurrency, parseAmountToCents } from "../lib/format";
import { useBank } from "../state/BankContext";

type Step = "form" | "review" | "done";

interface FormErrors {
  fromAccountId?: string;
  recipient?: string;
  recipientAccountNumber?: string;
  routingNumber?: string;
  amount?: string;
}

const ACCOUNT_NUMBER_PATTERN = /^\d{10}$/;
const ROUTING_NUMBER_PATTERN = /^\d{9}$/;

interface Receipt {
  amountCents: number;
  recipient: string;
  recipientAccountNumber: string;
  fromLabel: string;
  newBalanceCents: number;
}

const STEP_LABELS: { id: Step; label: string }[] = [
  { id: "form", label: "Details" },
  { id: "review", label: "Review" },
  { id: "done", label: "Done" },
];

function stepIndex(step: Step): number {
  return STEP_LABELS.findIndex((item) => item.id === step);
}

export default function TransferPage() {
  const navigate = useNavigate();
  const { accounts, transfer } = useBank();
  const eligible = useMemo(
    () => accounts.filter((account) => account.kind !== "credit"),
    [accounts],
  );

  const [step, setStep] = useState<Step>("form");
  const [fromAccountId, setFromAccountId] = useState(eligible[0]?.id ?? "");
  const [recipient, setRecipient] = useState("");
  const [recipientAccountNumber, setRecipientAccountNumber] = useState("");
  const [routingNumber, setRoutingNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [externalModalOpen, setExternalModalOpen] = useState(false);

  const selected = eligible.find((account) => account.id === fromAccountId) ?? eligible[0];
  const amountCents = parseAmountToCents(amount);
  const currentIndex = stepIndex(step);

  useEffect(() => {
    if (!externalModalOpen) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setExternalModalOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [externalModalOpen]);

  function handleContinue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: FormErrors = {};

    if (!selected) {
      next.fromAccountId = "Select an account to transfer from.";
    }
    if (!recipient.trim()) {
      next.recipient = "Enter the recipient's name.";
    }
    const accountNumber = recipientAccountNumber.replace(/\D/g, "");
    if (!accountNumber) {
      next.recipientAccountNumber = "Enter the recipient's account number.";
    } else if (!ACCOUNT_NUMBER_PATTERN.test(accountNumber)) {
      next.recipientAccountNumber = "Enter a valid 10-digit account number.";
    }
    const routing = routingNumber.replace(/\D/g, "");
    if (!routing) {
      next.routingNumber = "Enter the recipient's routing number.";
    } else if (!ROUTING_NUMBER_PATTERN.test(routing)) {
      next.routingNumber = "Enter a valid 9-digit routing number.";
    }
    if (amountCents === null || amountCents <= 0) {
      next.amount = "Enter an amount like 125.00.";
    } else if (selected && amountCents > selected.balanceCents) {
      next.amount = "That is more than the available balance.";
    }

    setErrors(next);
    if (Object.keys(next).length === 0) {
      setStep("review");
    }
  }

  async function handleConfirm() {
    if (!selected || amountCents === null || submitting) {
      return;
    }

    const accountNumber = recipientAccountNumber.replace(/\D/g, "");
    if (!ACCOUNT_NUMBER_PATTERN.test(accountNumber)) {
      setExternalModalOpen(true);
      return;
    }

    const routing = routingNumber.replace(/\D/g, "");
    if (!ROUTING_NUMBER_PATTERN.test(routing)) {
      setErrors({ routingNumber: "Enter a valid 9-digit routing number." });
      setStep("form");
      return;
    }

    setSubmitting(true);
    const result = await transfer({
      fromAccountId: selected.id,
      recipient: recipient.trim(),
      recipientAccountNumber: accountNumber,
      amountCents,
      memo: memo.trim(),
    });
    setSubmitting(false);

    if (!result.ok || !result.confirmation) {
      if (result.reason === "external-account") {
        setExternalModalOpen(true);
        return;
      }
      setErrors({ amount: result.error ?? "Something went wrong. Try again." });
      setStep("form");
      return;
    }

    setReceipt({
      amountCents,
      recipient: recipient.trim(),
      recipientAccountNumber: accountNumber,
      fromLabel: `${selected.name} ••${selected.mask}`,
      newBalanceCents: selected.balanceCents - amountCents,
    });
    setConfirmation(result.confirmation);
    setStep("done");
  }

  function handleReset() {
    setStep("form");
    setRecipient("");
    setRecipientAccountNumber("");
    setRoutingNumber("");
    setAmount("");
    setMemo("");
    setErrors({});
    setReceipt(null);
    setConfirmation("");
    setSubmitting(false);
    setFromAccountId(eligible[0]?.id ?? "");
  }

  return (
    <div className="transfer">
      <header className="page__header">
        <div>
          <p className="greeting">Move money</p>
          <h1 className="page__title">Send money</h1>
          <p className="page__sub">
            Send money to another Industry Bank customer using their account
            number. Balances update live on both dashboards.
          </p>
        </div>
      </header>

      <ol className="steps" aria-label="Transfer progress">
        {STEP_LABELS.map((item, index) => {
          const state =
            index < currentIndex ? "step step--done" : index === currentIndex ? "step step--active" : "step";
          return (
            <li key={item.id} className={state} aria-current={index === currentIndex ? "step" : undefined}>
              <span className="step__num" aria-hidden="true">
                {index < currentIndex ? "✓" : index + 1}
              </span>
              {item.label}
            </li>
          );
        })}
      </ol>

      {step === "form" ? (
        <section className="card card--pad">
          <form className="form-grid" onSubmit={handleContinue} noValidate>
            <div className="field">
              <label className="field__label" htmlFor="from-account">
                From account
              </label>
              <select
                id="from-account"
                className="input"
                value={fromAccountId}
                onChange={(event) => {
                  setFromAccountId(event.target.value);
                  setErrors((previous) => ({ ...previous, fromAccountId: undefined }));
                }}
              >
                {eligible.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} ••{account.mask} — {formatCurrency(account.balanceCents)}
                  </option>
                ))}
              </select>
              {errors.fromAccountId ? (
                <p className="field__error" role="alert">
                  {errors.fromAccountId}
                </p>
              ) : null}
            </div>

            <div className="form-row">
              <div className="field">
                <label className="field__label" htmlFor="recipient">
                  Recipient name
                </label>
                <input
                  id="recipient"
                  className="input"
                  type="text"
                  placeholder="Jordan Lee"
                  value={recipient}
                  onChange={(event) => {
                    setRecipient(event.target.value);
                    setErrors((previous) => ({ ...previous, recipient: undefined }));
                  }}
                  aria-invalid={errors.recipient ? "true" : undefined}
                />
                {errors.recipient ? (
                  <p className="field__error" role="alert">
                    {errors.recipient}
                  </p>
                ) : null}
              </div>

              <div className="field">
                <label className="field__label" htmlFor="recipient-account-number">
                  Recipient account number
                </label>
                <input
                  id="recipient-account-number"
                  className="input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="1234567890"
                  maxLength={10}
                  value={recipientAccountNumber}
                  onChange={(event) => {
                    setRecipientAccountNumber(
                      event.target.value.replace(/\D/g, "").slice(0, 10),
                    );
                    setErrors((previous) => ({
                      ...previous,
                      recipientAccountNumber: undefined,
                    }));
                  }}
                  aria-invalid={errors.recipientAccountNumber ? "true" : undefined}
                  aria-describedby="recipient-account-number-hint"
                />
                <p className="field__hint" id="recipient-account-number-hint">
                  10 digits, no spaces.
                </p>
                {errors.recipientAccountNumber ? (
                  <p className="field__error" role="alert">
                    {errors.recipientAccountNumber}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="routing-number">
                Routing number
              </label>
              <input
                id="routing-number"
                className="input"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="021000021"
                maxLength={9}
                value={routingNumber}
                onChange={(event) => {
                  setRoutingNumber(event.target.value.replace(/\D/g, "").slice(0, 9));
                  setErrors((previous) => ({ ...previous, routingNumber: undefined }));
                }}
                aria-invalid={errors.routingNumber ? "true" : undefined}
                aria-describedby="routing-number-hint"
              />
              <p className="field__hint" id="routing-number-hint">
                9 digits, no spaces.
              </p>
              {errors.routingNumber ? (
                <p className="field__error" role="alert">
                  {errors.routingNumber}
                </p>
              ) : null}
            </div>

            <div className="form-row">
              <div className="field">
                <label className="field__label" htmlFor="amount">
                  Amount
                </label>
                <div className="input-wrap">
                  <span className="input-wrap__prefix" aria-hidden="true">
                    $
                  </span>
                  <input
                    id="amount"
                    className="input input--amount"
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={amount}
                    onChange={(event) => {
                      setAmount(event.target.value);
                      setErrors((previous) => ({ ...previous, amount: undefined }));
                    }}
                    aria-invalid={errors.amount ? "true" : undefined}
                    aria-describedby="amount-hint"
                  />
                </div>
                <p className="field__hint" id="amount-hint">
                  Available: {selected ? formatCurrency(selected.balanceCents) : "$0.00"}
                </p>
                {errors.amount ? (
                  <p className="field__error" role="alert">
                    {errors.amount}
                  </p>
                ) : null}
              </div>

              <div className="field">
                <label className="field__label" htmlFor="memo">
                  Memo <span className="field__optional">(optional)</span>
                </label>
                <input
                  id="memo"
                  className="input"
                  type="text"
                  placeholder="What is this for?"
                  value={memo}
                  onChange={(event) => setMemo(event.target.value)}
                />
              </div>
            </div>

            <div className="form-actions">
              <Link to="/" className="btn btn--ghost">
                Cancel
              </Link>
              <button type="submit" className="btn btn--primary">
                Review transfer
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {step === "review" && selected && amountCents !== null ? (
        <section className="card card--pad">
          <h2 className="section-title">Review transfer</h2>
          <p className="section-sub">Check the details before you confirm.</p>

          <dl className="review">
            <div>
              <dt>From</dt>
              <dd>
                {selected.name} ••{selected.mask}
              </dd>
            </div>
            <div>
              <dt>To</dt>
              <dd>{recipient.trim()}</dd>
            </div>
            <div>
              <dt>Recipient account</dt>
              <dd>{recipientAccountNumber.replace(/\D/g, "")}</dd>
            </div>
            <div>
              <dt>Routing number</dt>
              <dd>{routingNumber}</dd>
            </div>
            <div>
              <dt>Amount</dt>
              <dd className="review__amount">{formatCurrency(amountCents)}</dd>
            </div>
            <div>
              <dt>Memo</dt>
              <dd>{memo.trim() || "Transfer"}</dd>
            </div>
            <div>
              <dt>When</dt>
              <dd>Today</dd>
            </div>
          </dl>

          <div className="form-actions">
            <button type="button" className="btn btn--ghost" onClick={() => setStep("form")}>
              Back
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={handleConfirm}
              disabled={submitting}
            >
              {submitting ? "Sending…" : "Confirm transfer"}
            </button>
          </div>
        </section>
      ) : null}

      {step === "done" && receipt ? (
        <section className="card card--pad">
          <div className="success">
            <span className="success__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 13l4 4L19 7" />
              </svg>
            </span>
            <h2 className="page__title">Transfer complete</h2>
            <p className="success__amount">{formatCurrency(receipt.amountCents)}</p>
            <p className="section-sub">
              Sent to {receipt.recipient} · Account {receipt.recipientAccountNumber} from{" "}
              {receipt.fromLabel}.
            </p>
            <p className="success__ref">Confirmation {confirmation}</p>
            <p className="field__hint">
              New balance: {formatCurrency(receipt.newBalanceCents)}
            </p>
            <div className="success__actions">
              <button type="button" className="btn btn--ghost" onClick={handleReset}>
                Make another transfer
              </button>
              <Link to="/" className="btn btn--primary">
                Back to dashboard
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      {externalModalOpen ? (
        <div
          className="modal"
          role="presentation"
          onClick={() => setExternalModalOpen(false)}
        >
          <div
            className="modal__panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="external-transfer-title"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="modal__icon" aria-hidden="true">
              !
            </span>
            <h2 className="modal__title" id="external-transfer-title">
              Transfer failed
            </h2>
            <p className="modal__body">
              Transfer failed. Your transfer is pending and waiting to send.
              Please contact support for help.
            </p>
            <button
              type="button"
              className="btn btn--primary btn--block"
              onClick={() => {
                setExternalModalOpen(false);
                navigate("/support");
              }}
            >
              Contact Support
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
