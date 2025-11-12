const fs = require('fs');
const sequelize = require('./db');
require('dotenv').config();

async function setupDatabase() {
  try {
    console.log('Setting up database...');
    
    // Ensure the database directory exists
    if (!fs.existsSync('./database')) {
      fs.mkdirSync('./database', { recursive: true });
      console.log('Created database directory.');
    }
    
    // Read and execute schema file (using raw queries with sequelize)
    const schemaSQL = fs.readFileSync('./database/schema.sql', 'utf8');
    console.log('Creating tables...');
    await sequelize.query(schemaSQL);
    console.log('Tables created successfully.');
    
    // Read and execute seed data file
    const seedSQL = fs.readFileSync('./database/seed-data.sql', 'utf8');
    console.log('Inserting sample data...');
    await sequelize.query(seedSQL);
    console.log('Sample data inserted successfully.');
    
    console.log('Database setup completed!');
  } catch (err) {
    console.error('Error setting up database:', err);
  } finally {
    // Don't close the connection here as you might with pg,
    // as Sequelize handles connection pooling differently
    await sequelize.close();
  }
}

setupDatabase();