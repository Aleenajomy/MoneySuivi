const { handleError } = require('../utils/http');
const salaryPlan = require('../services/salaryPlanService');

// Every handler reads or writes the month's planning figures only; none touches a transaction.

const getPlan = async (req, res) => {
  try {
    res.json({ success: true, ...(await salaryPlan.get(req.user.id, req.query.year, req.query.month)) });
  } catch (error) {
    handleError(res, error, 'planner.getSalaryPlan');
  }
};

const initPlan = async (req, res) => {
  try {
    const { year, month } = req.body;
    const created = await salaryPlan.initialize(req.user.id, year, month);
    res.status(created ? 201 : 200).json({ success: true, created, ...(await salaryPlan.get(req.user.id, year, month)) });
  } catch (error) {
    handleError(res, error, 'planner.initSalaryPlan');
  }
};

const updatePlan = async (req, res) => {
  try {
    const { year, month, ...values } = req.body;
    res.json({ success: true, ...(await salaryPlan.update(req.user.id, year, month, values)) });
  } catch (error) {
    handleError(res, error, 'planner.updateSalaryPlan');
  }
};

const resetPlan = async (req, res) => {
  try {
    res.json({ success: true, ...(await salaryPlan.resetToDefaults(req.user.id, req.body.year, req.body.month)) });
  } catch (error) {
    handleError(res, error, 'planner.resetSalaryPlan');
  }
};

module.exports = { getPlan, initPlan, updatePlan, resetPlan };
