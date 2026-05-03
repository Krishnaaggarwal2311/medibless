require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { connectDb } = require('../config/db');
const { Medicine } = require('../models');

async function main() {
  await connectDb();
  const match = {};
  const rows = await Medicine.aggregate([
    { $match: match },
    {
      $addFields: {
        discounted_price: {
          $round: [{ $subtract: ['$price', { $multiply: ['$price', { $divide: ['$discount_percent', 100] }] }] }, 2]
        }
      }
    },
    {
      $lookup: {
        from: 'medicine_categories',
        localField: 'category_id',
        foreignField: 'id',
        as: 'mc'
      }
    },
    { $addFields: { category_name: { $ifNull: [{ $arrayElemAt: ['$mc.name', 0] }, ''] } } },
    { $project: { mc: 0 } },
    { $sort: { name: 1 } },
    { $skip: 0 },
    { $limit: 24 }
  ]);
  console.log('ok rows', rows.length);
  const mongoose = require('mongoose');
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error('FAIL', e.message);
  console.error(e);
  process.exit(1);
});
