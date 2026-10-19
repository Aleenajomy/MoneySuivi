// Branded two-column layout shared by the password recovery screens.
export default function AuthShell({ children }) {
  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-12 dark:bg-dark-bg bg-light-bg transition-colors duration-300">
      <div className="hidden lg:flex lg:col-span-5 flex-col justify-between p-12 text-white relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0284C7 0%, #0EA5E9 50%, #38BDF8 100%)' }}>
        <div className="absolute -top-12 -left-12 w-64 h-64 rounded-full bg-white/5" />
        <div className="absolute -bottom-24 -right-12 w-80 h-80 rounded-full bg-white/5" />
        <div className="flex items-center gap-3">
          <img
            src="/logo.png?v=2"
            alt="MoneySuivi Logo"
            className="w-11 h-11 rounded-xl object-contain shadow-lg shadow-sky-500/30 flex-shrink-0"
          />
          <span className="font-black text-xl tracking-tight">MoneySuivi</span>
        </div>
        <div className="space-y-4 my-auto pr-8">
          <h2 className="text-4xl font-extrabold leading-tight">Master your money. Elevate your financial future.</h2>
          <p className="text-blue-100 text-sm font-medium leading-relaxed">
            Get instant control over expenses, map assets and liabilities, monitor budgets, and manage loans in a single, secure environment.
          </p>
        </div>
        <p className="text-xs text-blue-200 font-semibold">MoneySuivi All-in-One Finance © 2026</p>
      </div>

      <div className="col-span-1 lg:col-span-7 flex flex-col justify-center items-center p-6 sm:p-12 relative">
        <div className="w-full max-w-md flex justify-between items-center mb-8 lg:hidden">
          <div className="flex items-center gap-2.5">
            <img
              src="/logo.png?v=2"
              alt="MoneySuivi Logo"
              className="w-8 h-8 rounded-lg object-contain shadow-md shadow-sky-500/20 flex-shrink-0"
            />
            <span className="font-black text-sm tracking-tight dark:text-white text-slate-800">MoneySuivi</span>
          </div>
        </div>
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  )
}
