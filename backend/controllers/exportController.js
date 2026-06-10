const prisma = require('../lib/prisma');
const PDFDocument = require('pdfkit');

const buildDateFilter = (startDate, endDate) => {
  if (!startDate && !endDate) return undefined;
  const filter = {};
  if (startDate) filter.gte = new Date(startDate);
  if (endDate) filter.lte = new Date(`${endDate}T23:59:59.999`);
  return filter;
};

const getExportData = async (userId, query = {}) => {
  if (!userId || typeof userId !== 'string' || userId.trim() === '') {
    throw new Error('Unauthorized: Valid User ID is required');
  }
  const { startDate, endDate, type, category, search } = query;
  const where = {
    userId: {
      equals: userId
    }
  };
  const expenseDate = buildDateFilter(startDate, endDate);
  if (expenseDate) where.expenseDate = expenseDate;
  if (type && type !== 'All') where.type = type;
  if (category && category !== 'All') where.category = category;
  if (search) where.title = { contains: search, mode: 'insensitive' };
  return prisma.expense.findMany({ where, orderBy: { expenseDate: 'desc' } });
};

const formatDate = (date) => new Date(date).toLocaleDateString('en-IN');
const formatAmount = (amount) => `Rs. ${Number(amount).toLocaleString('en-IN')}`;

const drawFooter = (doc) => {
  const bottom = doc.page.height - 36;
  doc.fontSize(8).fillColor('#94a3b8')
    .text(`Generated on ${formatDate(new Date())} | MoneySuivi`, 40, bottom, {
      width: doc.page.width - 80,
      align: 'center',
    });
};

const exportPDF = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ success: false, message: 'Unauthorized: User is not authenticated' });
    }
    const { startDate, endDate } = req.query;
    const expenses = await getExportData(req.user.id, req.query);
    const totalIncome = expenses.filter(e => e.type === 'income').reduce((sum, e) => sum + e.amount, 0);
    const totalExpense = expenses.filter(e => e.type === 'expense').reduce((sum, e) => sum + e.amount, 0);

    const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="expense-report-${Date.now()}.pdf"`);
    doc.pipe(res);

    doc.fontSize(20).fillColor('#4f46e5').text('Expense Report', { align: 'center' });
    doc.moveDown(0.25);
    doc.fontSize(10).fillColor('#64748b')
      .text(`Date range: ${startDate || 'All'} to ${endDate || 'All'}`, { align: 'center' });
    doc.moveDown();

    doc.fontSize(13).fillColor('#111827').text('Summary');
    doc.moveDown(0.4);
    doc.fontSize(10).fillColor('#047857').text(`Total Income: ${formatAmount(totalIncome)}`);
    doc.fillColor('#dc2626').text(`Total Expense: ${formatAmount(totalExpense)}`);
    doc.fillColor('#4f46e5').text(`Balance: ${formatAmount(totalIncome - totalExpense)}`);
    doc.moveDown();

    const columns = [
      { label: 'Date', x: 40, width: 72 },
      { label: 'Category', x: 112, width: 90 },
      { label: 'Description', x: 202, width: 180 },
      { label: 'Type', x: 382, width: 60 },
      { label: 'Amount', x: 442, width: 90, align: 'right' },
    ];

    const drawHeader = () => {
      doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#e5e7eb').stroke();
      doc.moveDown(0.4);
      const y = doc.y;
      doc.fontSize(9).fillColor('#64748b');
      columns.forEach(col => doc.text(col.label, col.x, y, { width: col.width, align: col.align || 'left' }));
      doc.moveDown(0.8);
      doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#e5e7eb').stroke();
      doc.moveDown(0.35);
    };

    drawHeader();

    expenses.forEach((expense) => {
      if (doc.y > 720) {
        drawFooter(doc);
        doc.addPage();
        drawHeader();
      }

      const y = doc.y;
      doc.fontSize(8.5).fillColor('#111827');
      doc.text(formatDate(expense.expenseDate), 40, y, { width: 72 });
      doc.text(expense.category, 112, y, { width: 90 });
      doc.text(expense.title, 202, y, { width: 180 });
      doc.text(expense.type, 382, y, { width: 60 });
      doc.text(formatAmount(expense.amount), 442, y, { width: 90, align: 'right' });
      doc.moveDown(0.75);
    });

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      drawFooter(doc);
    }

    doc.end();
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { exportPDF };
