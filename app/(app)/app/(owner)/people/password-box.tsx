// The one place a generated password is ever shown. It is not stored anywhere
// the app can read back, so the owner texts it right away.
export function PasswordBox({
  title,
  email,
  password,
}: {
  title: string;
  email?: string;
  password: string;
}) {
  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-md border border-primary bg-accent px-4 py-3 text-sm text-accent-foreground"
    >
      <p className="font-semibold">{title}</p>
      {email ? (
        <p>
          Email: <span className="font-semibold">{email}</span>
        </p>
      ) : null}
      <p>
        Password:{" "}
        <span className="font-mono text-base font-semibold tracking-wide">
          {password}
        </span>
      </p>
      <p className="text-muted-foreground">
        Text it to them now. It is not stored and will not be shown again.
      </p>
    </div>
  );
}
