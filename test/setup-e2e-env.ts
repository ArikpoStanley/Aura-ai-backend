process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017/aura_e2e';
process.env.JWT_SECRET ??=
  'e2e-jwt-secret-at-least-32-characters-long-for-tests';
