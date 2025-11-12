const bcrypt = require("bcrypt");

async function generatePassword() {
  const plainPassword = "TSLFreightMovers"; // you can change this
  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash(plainPassword, saltRounds);
  console.log("Hashed Password:", hashedPassword);
}

generatePassword();

//tslhead@gmail.com Super Admin
//email:tslhead@gmail.com
//pw: TSLFreightMovers

//Operational Manager
//email: tsl.opsmanager.tsl@gmail.com
//pw: TSLFreightMovers

//Accounting
//email: tslfinance.tsl@gmail.com
//pw: TSLFreightMovers
