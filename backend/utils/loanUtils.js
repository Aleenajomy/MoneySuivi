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

    for (let k = 1; k <= N; k++) {
      if (remainingPrincipal <= 0) break;
      const monthlyInterest = remainingPrincipal * r;
      if (k <= m) {
        const instInterestPaid = Math.min(monthlyInterest, E);
        const instPrincipalPaid = Math.min(E - instInterestPaid, remainingPrincipal);

        interestPaid += instInterestPaid;
        principalPaid += instPrincipalPaid;
        remainingPrincipal -= instPrincipalPaid;
      }
    }

    const totalPayableAmount = E * N;
    // remainingBalance = outstanding principal from amortization schedule (NOT remaining EMI payments)
    const remainingBalance = Math.max(0, remainingPrincipal);

    return {
      hasInterest: true,
      accruedInterest: totalPayableAmount - P,
      totalPayableAmount,
      principalPaid,
      interestPaid,
      remainingBalance,
      amountPaid: m * E
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
    
    const events = [];
    
    for (const p of allPayments) {
      events.push({
        date: new Date(p.paidAt),
        type: 'payment',
        amount: Number(p.amount)
      });
    }
    
    let maxDate = emi.active !== false ? new Date() : new Date(emi.startDate);
    for (const p of allPayments) {
      const pDate = new Date(p.paidAt);
      if (pDate > maxDate) maxDate = pDate;
    }
    
    let monthIndex = 1;
    while (true) {
      const annDate = new Date(emi.startDate);
      annDate.setUTCMonth(annDate.getUTCMonth() + monthIndex);
      if (annDate > maxDate) break;
      
      events.push({
        date: annDate,
        type: 'anniversary'
      });
      monthIndex++;
    }
    
    events.sort((a, b) => {
      const diff = a.date - b.date;
      if (diff !== 0) return diff;
      if (a.type === 'anniversary' && b.type === 'payment') return -1;
      if (a.type === 'payment' && b.type === 'anniversary') return 1;
      return 0;
    });
    
    let outstandingPrincipal = P;
    let totalInterestAccrued = 0;
    let totalInterestPaid = 0;
    let totalPrincipalPaid = 0;
    
    for (const ev of events) {
      if (ev.type === 'anniversary') {
        if (outstandingPrincipal > 0) {
          const interestAccrued = outstandingPrincipal * R / 100 / 12;
          totalInterestAccrued += interestAccrued;
        }
      } else if (ev.type === 'payment') {
        const payAmount = ev.amount;
        const unpaidInterest = totalInterestAccrued - totalInterestPaid;
        const interestPayment = Math.min(payAmount, unpaidInterest);
        const principalPayment = Math.min(payAmount - interestPayment, outstandingPrincipal);
        
        totalInterestPaid += interestPayment;
        totalPrincipalPaid += principalPayment;
        outstandingPrincipal -= principalPayment;
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

module.exports = {
  getLoanDetails
};
