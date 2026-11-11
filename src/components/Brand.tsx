import { Link } from "react-router-dom";

interface BrandProps {
  to?: string;
  className?: string;
}

export default function Brand({ to = "/", className = "" }: BrandProps) {
  return (
    <Link to={to} className={`brand ${className}`.trim()} aria-label="Industry Bank home">
      <span className="brand__mark" aria-hidden="true">
        IB
      </span>
      <span className="brand__text">
        Industry <span>Bank</span>
      </span>
    </Link>
  );
}
