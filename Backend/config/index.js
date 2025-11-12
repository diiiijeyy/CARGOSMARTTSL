import * as dotenv from "dotenv";
dotenv.config();

const {
    DB_HOST,
    DB_USER,
    DB_PASSWORD,
    DB_NAME,
    DB_DIALECT,
    JWT_SECRET,
    EMAIL_USER,
    EMAIL_PASS,
} = process.env;

// PostgreSQL connection URI (for Sequelize or pg-promise)
const PG_URI = `postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}/${DB_NAME}`;

export {
    PG_URI,
    DB_DIALECT,
    JWT_SECRET,
    EMAIL_USER,
    EMAIL_PASS,

};