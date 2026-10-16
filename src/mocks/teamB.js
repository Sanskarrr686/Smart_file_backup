// src/mocks/teamB.js
// Stands in for Team B (Deduplication & Integrity Engine).

const dedupResults = {
  bkp_55: { dedup_result_id: "ded_1", unique_chunks: 40, duplicate_chunks: 12, savings_ratio: 0.23 },
  bkp_56: { dedup_result_id: "ded_2", unique_chunks: 88, duplicate_chunks: 44, savings_ratio: 0.33 },
};

const verification = {
  bkp_55: { merkle_root: "m_root_abc123", verified_chunks: 52, corrupted_chunks: 0, status: "VERIFIED" },
};

module.exports = { dedupResults, verification };
