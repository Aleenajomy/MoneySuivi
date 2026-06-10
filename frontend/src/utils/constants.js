export const CATEGORIES = ['Food', 'Travel', 'Shopping', 'Bills', 'Entertainment', 'Salary', 'Healthcare', 'Other']
export const INCOME_CATEGORIES = ['Salary', 'Freelance', 'Investment', 'Gift', 'Other']
export const EXPENSE_CATEGORIES = ['Food', 'Travel', 'Shopping', 'Bills', 'Entertainment', 'Healthcare', 'Other']
export const PAYMENT_METHODS = ['Cash', 'UPI', 'Credit Card', 'Debit Card', 'Other']
export const ACCOUNT_TYPES = ['Cash', 'Bank', 'UPI', 'Wallet', 'Credit Card']

export const CATEGORY_ICONS = {
  Food: 'Utensils',
  Travel: 'Bus',
  Shopping: 'ShoppingBag',
  Bills: 'Receipt',
  Entertainment: 'Tv',
  Salary: 'Banknote',
  Healthcare: 'HeartPulse',
  Other: 'CircleDot',
  Freelance: 'Briefcase',
  Investment: 'TrendingUp',
  Gift: 'Gift',
}

export const CATEGORY_COLORS = {
  Food: '#FF6B6B',
  Travel: '#0EA5E9',
  Shopping: '#06B6D4',
  Bills: '#FB923C',
  Entertainment: '#F472B6',
  Salary: '#00C896',
  Healthcare: '#38BDF8',
  Other: '#94A3B8',
  Freelance: '#34D399',
  Investment: '#FBBF24',
  Gift: '#F87171',
}

export const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount || 0)

export const formatDate = (date) =>
  new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

export const formatShortDate = (date) =>
  new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })

export const getLoanDetails = (emi) => {
  const isFixed = emi.type !== 'FLEXIBLE';
  const hasInterest = emi.interestRate !== null && emi.interestRate !== undefined && emi.interestRate !== '';
  
  if (!hasInterest) {
    const amountPaid = isFixed
      ? (Number(emi.paidAmount) || (Number(emi.paidInstallments) * Number(emi.emiAmount)))
      : Number(emi.paidAmount);
    const remainingBalance = Math.max(0, Number(emi.totalAmount) - amountPaid);
    return {
      hasInterest: false,
      accruedInterest: 0,
      totalPayableAmount: Number(emi.totalAmount),
      principalPaid: amountPaid,
      interestPaid: 0,
      remainingBalance,
      amountPaid
    };
  }
  
  const R = Number(emi.interestRate);
  const P = Number(emi.totalAmount);
  
  if (isFixed) {
    const r = R / 12 / 100;
    const E = Number(emi.emiAmount);
    const N = Number(emi.totalInstallments);
    const m = Number(emi.paidInstallments);

    let remainingPrincipal = P;
    let interestPaid = 0;
    let principalPaid = 0;
    let accruedInterest = 0;

    const start = new Date(emi.startDate);
    const today = new Date();
    const elapsedMonths = Math.max(0, (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth()));

    for (let k = 1; k <= N; k++) {
      if (remainingPrincipal <= 0) break;

      const monthlyInterest = remainingPrincipal * r;
      
      if (k <= m) {
        const instInterestPaid = Math.min(monthlyInterest, E);
        const instPrincipalPaid = Math.min(E - instInterestPaid, remainingPrincipal);

        interestPaid += instInterestPaid;
        principalPaid += instPrincipalPaid;
        accruedInterest += monthlyInterest;
        remainingPrincipal -= instPrincipalPaid;
      } else {
        if (k <= elapsedMonths) {
          accruedInterest += monthlyInterest;
        }
      }
    }

    if (elapsedMonths > N && remainingPrincipal > 0) {
      const overdueMonths = elapsedMonths - N;
      const monthlyInterest = remainingPrincipal * r;
      accruedInterest += overdueMonths * monthlyInterest;
    }

    const totalPaid = m * E;
    const totalPayableAmount = P + accruedInterest;
    const remainingBalance = Math.max(0, totalPayableAmount - totalPaid);

    return {
      hasInterest: true,
      accruedInterest,
      totalPayableAmount,
      principalPaid,
      interestPaid,
      remainingBalance,
      amountPaid: totalPaid
    };
  } else {
    const dbPayments = emi.payments || [];
    const dbPaymentsTotal = dbPayments.reduce((sum, p) => sum + Number(p.amount), 0);
    const initialPaymentAmount = Number(emi.paidAmount) - dbPaymentsTotal;
    
    const allPayments = [...dbPayments];
    if (initialPaymentAmount > 0) {
      allPayments.push({
        id: 'initial',
        amount: initialPaymentAmount,
        paidAt: emi.startDate,
        note: 'Initial payment'
      });
    }
    
    const sortedPayments = allPayments.sort((a, b) => new Date(a.paidAt) - new Date(b.paidAt));
    
    let outstandingPrincipal = P;
    let totalInterestAccrued = 0;
    let totalInterestPaid = 0;
    let totalPrincipalPaid = 0;
    
    let currentDate = new Date(emi.startDate);
    
    for (const p of sortedPayments) {
      const payDate = new Date(p.paidAt);
      const timeDiff = payDate - currentDate;
      const days = Math.max(0, Math.floor(timeDiff / (1000 * 60 * 60 * 24)));
      
      if (days > 0 && outstandingPrincipal > 0) {
        const dailyInterest = (outstandingPrincipal * R / 100) / 365;
        const interestAccrued = dailyInterest * days;
        totalInterestAccrued += interestAccrued;
      }
      
      const payAmount = Number(p.amount);
      const unpaidInterest = totalInterestAccrued - totalInterestPaid;
      const interestPayment = Math.min(payAmount, unpaidInterest);
      const principalPayment = Math.min(payAmount - interestPayment, outstandingPrincipal);
      
      totalInterestPaid += interestPayment;
      totalPrincipalPaid += principalPayment;
      outstandingPrincipal -= principalPayment;
      
      currentDate = payDate;
    }
    
    if (emi.active && outstandingPrincipal > 0) {
      const today = new Date();
      const timeDiff = today - currentDate;
      const days = Math.max(0, Math.floor(timeDiff / (1000 * 60 * 60 * 24)));
      
      if (days > 0) {
        const dailyInterest = (outstandingPrincipal * R / 100) / 365;
        const interestAccrued = dailyInterest * days;
        totalInterestAccrued += interestAccrued;
      }
    }
    
    const totalPaid = Number(emi.paidAmount);
    const totalPayableAmount = P + totalInterestAccrued;
    const remainingBalance = Math.max(0, totalPayableAmount - totalPaid);
    
    return {
      hasInterest: true,
      accruedInterest: totalInterestAccrued,
      totalPayableAmount,
      principalPaid: totalPrincipalPaid,
      interestPaid: totalInterestPaid,
      remainingBalance,
      amountPaid: totalPaid
    };
  }
};

