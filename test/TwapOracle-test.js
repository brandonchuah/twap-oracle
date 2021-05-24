const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { INIT_CODE_HASH } = require('@uniswap/sdk');
const { pack, keccak256 } = require('@ethersproject/solidity');
const { getCreate2Address } = require('@ethersproject/address');


const FACTORY = network.config.FACTORY;
const WETH = network.config.WETH;
const DAI = network.config.DAI;
const UNI = network.config.UNI;
const LINK = network.config.LINK;

const PATH_daiWeth = [DAI, WETH];
const PATH_uniLink = [UNI, WETH, LINK];

const period = 5 * 60 // 5 min

const sleep = (milliseconds) => {
    return new Promise(resolve => setTimeout(resolve, milliseconds))
}

const mineBlocks = async(num) => {
  for(let x=0; x<num; x++){
    await network.provider.send("evm_mine", []);
  }
}

const fastForwardTime = async(time) => {
  await network.provider.send("evm_increaseTime", [time]);
}

const logBlock = async() => {
  blockNumber = await ethers.provider.getBlockNumber();
  time = (await ethers.provider.getBlock()).timestamp;

}

describe("TwapOracle", function() {

    //-------------Contracts----------
    var twapOracle;
    var daiWeth, daiWethAddress;
    var uniWeth, uniWethAddress;
    var linkWeth, linkWethAddress;

    //-------------Signers------------
    var deployer, deployerAddress

    //-------------------------------
    var price0Cumulative_1, price1Cumulative_1;
    var price0Cumulative_2, price1Cumulative_2;
    var timeStamp1, timeStamp2;

    var expectedFirstReferenceTime;
    var firstReferenceTime;


    this.timeout(0);
    
    before(async function(){
      [deployer, user1, user2] = await ethers.getSigners();
      deployerAddress = await deployer.getAddress();

      const _twapOracle = await ethers.getContractFactory("TwapOracle");
      twapOracle = await _twapOracle.deploy(FACTORY, period);
      await mineBlocks(1);
      
      daiWethAddress = getCreate2Address(
        FACTORY,
        keccak256(['bytes'], [pack(['address', 'address'], [DAI, WETH])]),
        INIT_CODE_HASH
      );

      daiWeth = await ethers.getContractAt("IUniswapV2Pair", daiWethAddress);

      uniWethAddress = getCreate2Address(
        FACTORY,
        keccak256(['bytes'], [pack(['address', 'address'], [UNI, WETH])]),
        INIT_CODE_HASH
      );

      uniWeth = await ethers.getContractAt("IUniswapV2Pair", uniWethAddress);

      
      linkWethAddress = getCreate2Address(
        FACTORY,
        keccak256(['bytes'], [pack(['address', 'address'], [LINK, WETH])]),
        INIT_CODE_HASH
      );

      linkWeth = await ethers.getContractAt("IUniswapV2Pair", linkWethAddress);


      await logBlock();
    })

    it("Get start oracle task", async function(){
      const now = (await ethers.provider.getBlock()).timestamp;
      const delay = 60 * 60 // 1 hour
      expectedStartOracleTime = now + delay - period;

      await twapOracle.getStartOracleTask(1, delay, now);
      await mineBlocks(1);

      const block = await ethers.provider.getBlock();
      const topics = await twapOracle.filters.LogTaskSubmitted().topics;
      const filter = {
        address: twapOracle.address.toLowerCase(),
        blockhash: block.hash,
        topics,
      };
      const logs = await ethers.provider.getLogs(filter);
      const event = twapOracle.interface.parseLog(logs[0]);
      
      startOracleTime = event.args.startOracleTime;


      expect(startOracleTime).to.eql(ethers.BigNumber.from(expectedStartOracleTime));

      await logBlock();
      
    })

    it("Start DAI WETH oracle", async function(){
      const now = (await ethers.provider.getBlock()).timestamp;
      await fastForwardTime(startOracleTime - now);
      await mineBlocks(1);
      const newNow = (await ethers.provider.getBlock()).timestamp;
      expect(newNow).to.eql(expectedStartOracleTime);

      await daiWeth.sync();
      await twapOracle.exec(1, PATH_daiWeth);
      await mineBlocks(1);
      
      timeStamp1 = (await ethers.provider.getBlock()).timestamp;
      price0Cumulative_1 = await daiWeth.price0CumulativeLast();
      price1Cumulative_1 = await daiWeth.price1CumulativeLast();

      const oracle = await twapOracle.oraclesFromId(1, 0);

      expect(oracle.price0CumulativeLast).to.eql(price0Cumulative_1);
      expect(oracle.price1CumulativeLast).to.eql(price1Cumulative_1);
          
    })

    it("Get DAI/WETH price", async function(){
      const period = 5 * 60;
      await fastForwardTime(period);
      await daiWeth.sync();

      await mineBlocks(1);
      const price = await twapOracle.getPrice(1, PATH_daiWeth, ethers.utils.parseEther("1"));
      timeStamp2 = (await ethers.provider.getBlock()).timestamp;
      price0Cumulative_2 = await daiWeth.price0CumulativeLast();
      price1Cumulative_2 = await daiWeth.price1CumulativeLast();
      await mineBlocks(1);
    

      const expectedPrice = (price0Cumulative_2 - price0Cumulative_1) / 2**112 / (timeStamp2 - timeStamp1);
    //   const getAmountsOutPrice = await router.getAmountsOut(ethers.utils.parseEther("1"), PATH_daiWeth);
    
      expect(parseFloat(ethers.utils.formatEther(price)).toFixed(5)).to.eql(parseFloat(expectedPrice).toFixed(5));

    })

    it("Start UNI WETH LINK oracle", async function(){
      await uniWeth.sync();
      await linkWeth.sync();
      await twapOracle.exec(2, PATH_uniLink);
      await mineBlocks(1);
      
      timeStamp1 = (await ethers.provider.getBlock()).timestamp;
      uni_price0Cumulative_1 = await uniWeth.price0CumulativeLast();
      uni_price1Cumulative_1 = await uniWeth.price1CumulativeLast();

      link_price0Cumulative_1 = await linkWeth.price0CumulativeLast();
      link_price1Cumulative_1 = await linkWeth.price1CumulativeLast();

      const oracle_uniweth = await twapOracle.oraclesFromId(2, 0);
      const oracle_linkweth = await twapOracle.oraclesFromId(2, 1);

      expect(oracle_uniweth.price0CumulativeLast).to.eql(uni_price0Cumulative_1);
      expect(oracle_uniweth.price1CumulativeLast).to.eql(uni_price1Cumulative_1);
      expect(oracle_linkweth.price0CumulativeLast).to.eql(link_price0Cumulative_1);
      expect(oracle_linkweth.price1CumulativeLast).to.eql(link_price1Cumulative_1);
          
    })

    it("Get UNI/LINK price", async function(){
      const period = 5 * 60;
      await fastForwardTime(period);
      await uniWeth.sync();
      await linkWeth.sync();
      await mineBlocks(1);

      const price = await twapOracle.getPrice(2, PATH_uniLink, ethers.utils.parseEther("1"));
      timeStamp2 = (await ethers.provider.getBlock()).timestamp;
      uni_price0Cumulative_2 = await uniWeth.price0CumulativeLast();
      link_price0Cumulative_2 = await linkWeth.price0CumulativeLast();
      await mineBlocks(1);

    
      const uniwethPrice = (uni_price0Cumulative_2 - uni_price0Cumulative_1) / 2**112 / (timeStamp2 - timeStamp1);
      const linkwethPrice = (link_price0Cumulative_2 - link_price0Cumulative_1) / 2**112 / (timeStamp2 - timeStamp1);
      const expectedPrice = uniwethPrice / linkwethPrice;
    //   const getAmountsOutPrice = await router.getAmountsOut(ethers.utils.parseEther("1"), PATH_daiWeth);

      expect(parseFloat(ethers.utils.formatEther(price)).toFixed(7)).to.eql(parseFloat(expectedPrice).toFixed(7));

    })

   
});


