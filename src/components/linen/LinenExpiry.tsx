import { getNodeExpiry } from "./linenExpiry";
export default function LinenExpiry({
  value,
  now,
  en,
}: {
  value: unknown;
  now: number;
  en: boolean;
}) {
  const expiry = getNodeExpiry(value, now);
  if (!expiry) return null;
  const remaining =
    expiry.state === "expired"
      ? en
        ? "Expired"
        : "已到期"
      : en
        ? expiry.days + (expiry.days === 1 ? " day left" : " days left")
        : "剩余 " + expiry.days + " 天";
  return (
    <div className="linen-node-extra linen-expiry" data-state={expiry.state}>
      <span>
        {en ? "Expiry" : "到期日期"}{" "}
        <time dateTime={expiry.date}>{expiry.date}</time>
      </span>
      <strong>{remaining}</strong>
    </div>
  );
}
