const variantStyles = {
  teacher:
    "text-emerald-800 hover:text-emerald-950 focus-visible:ring-emerald-900 focus-visible:ring-offset-stone-50",
  quiz: "text-emerald-50 hover:text-white focus-visible:ring-white focus-visible:ring-offset-[#1F2E23]",
};

export default function HomeLink({ className = "", variant = "teacher" }) {
  return (
    <a
      className={`inline-flex items-center gap-2 rounded-sm text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${variantStyles[variant]} ${className}`}
      href={import.meta.env.BASE_URL}
    >
      <span aria-hidden="true">←</span>
      返回首頁
    </a>
  );
}
