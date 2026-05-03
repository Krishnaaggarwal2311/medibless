const { nextId } = require('./nextId');

module.exports = {
  Counter: require('./Counter'),
  Admin: require('./Admin'),
  User: require('./User'),
  DoctorProfile: require('./DoctorProfile'),
  DoctorAvailability: require('./DoctorAvailability'),
  Appointment: require('./Appointment'),
  Review: require('./Review'),
  MedicineCategory: require('./MedicineCategory'),
  Medicine: require('./Medicine'),
  Cart: require('./Cart'),
  Order: require('./Order'),
  OrderItem: require('./OrderItem'),
  Notification: require('./Notification'),
  AppSettings: require('./AppSettings'),
  HealthRecord: require('./HealthRecord'),
  nextId
};
