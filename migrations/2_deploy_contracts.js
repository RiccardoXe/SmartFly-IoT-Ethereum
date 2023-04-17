//NOTE: Contract name in file should be the same as the .sol title
const SmartFlyUntrustedSC = artifacts.require("./SmartFliesEndPaper.sol");
const SmartFlyPartiallyTrustedSC = artifacts.require("./SmartFliesPartiallyTrusted.sol");
const SmartFlySemiTrustedSC = artifacts.require("./SmartFliesSemiTrusted.sol");
const SmartFlyMixed = artifacts.require("./SmartFliesMixed.sol");

module.exports = function(deployer) {
  //deploy RLP
  //deployer.deploy(RLPReader);
  //link and deploy DifficultyMMRLight
  //deployer.link(RLPReader, DifficultyMMRLight)
  //deployer.deploy(DifficultyMMRLight);
  deployer.deploy(SmartFlyUntrustedSC);
  deployer.deploy(SmartFlySemiTrustedSC); 
  deployer.deploy(SmartFlyPartiallyTrustedSC);
  deployer.deploy(SmartFlyMixed);
};
