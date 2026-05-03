/**
 * Mongo aggregations: MySQL-migrated docs may store price/discount_percent as strings — coerce with $toDouble.
 */

function discountedUnitExpr(pricePath, discountPercentPath) {
  return {
    $let: {
      vars: {
        p: { $toDouble: { $ifNull: [pricePath, 0] } },
        d: { $toDouble: { $ifNull: [discountPercentPath, 0] } }
      },
      in: { $subtract: ['$$p', { $multiply: ['$$p', { $divide: ['$$d', 100] }] }] }
    }
  };
}

/** Rounded discounted unit price (2 decimals). */
function discountedPriceExpr(pricePath, discountPercentPath) {
  return { $round: [discountedUnitExpr(pricePath, discountPercentPath), 2] };
}

module.exports = { discountedPriceExpr, discountedUnitExpr };
