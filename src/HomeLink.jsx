export default function HomeLink({ className = "" }) {
  return (
    <a
      className={`inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:text-emerald-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${className}`}
      href={import.meta.env.BASE_URL}
    >
      <span aria-hidden="true">←</span>
      返回首頁
    </a>
  );
}
