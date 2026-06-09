const prisma = require('./lib/prisma');

const getLoanDetails = (emi) => {
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

async function main() {
  const emis = await prisma.eMI.findMany({
    include: { payments: true }
  });
  for (const emi of emis) {
    console.log(`EMI: ${emi.title}`);
    console.log(getLoanDetails(emi));
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());

