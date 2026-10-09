const dashboardService = require("../services/dashboardService");
const teamBClient = require("../clients/teamBClient");
const { success } = require("../utils/response");

exports.getDashboard = async (req, res, next) => {
  try {
    const dashboardData = await dashboardService.getDashboard(req.user);
    return success(res, dashboardData);
  } catch (err) {
    next(err);
  }
};

exports.getIntegrity = async (req, res, next) => {
  try {
    const [chunkIndex, dedupMetrics] = await Promise.all([
      teamBClient.getChunkIndex({ correlationId: req.correlationId }),
      teamBClient.getDedupMetrics({ correlationId: req.correlationId }),
    ]);
    return success(res, {
      chunk_index: chunkIndex,
      dedup_metrics: dedupMetrics,
    });
  } catch (err) {
    next(err);
  }
};
