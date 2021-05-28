const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { INIT_CODE_HASH } = require('@uniswap/sdk');
const { pack, keccak256 } = require('@ethersproject/solidity');
const { getCreate2Address } = require('@ethersproject/address');
const router_abi = require("@uniswap/v2-periphery/build/IUniswapV2Router02.json").abi;
const ierc20_abi = require("@openzeppelin/contracts/build/contracts/IERC20.json").abi;
const oracleAggregator_abi = require("./abi/oracleAggregator.json").abi;

const FACTORY = network.config.FACTORY;
const ROUTER = network.config.ROUTER;
const WETH = network.config.WETH;
const DAI = network.config.DAI;
const UNI = network.config.UNI;
const LINK = network.config.LINK;
const OA = network.config.OracleAggregator;

const PATH = [WETH, DAI];

const FIVE_MIN = 5 * 60;
const FIFTEEN_MIN = 15 * 60;
const HALF_HOUR = 30 * 60;
const ONE_HOUR = 60 * 60;

var MARKET = {"BEAR": 0.8, "NEUT": 0.5, "BULL": 0.2}

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
  console.log(time);
}

describe("TwapOracle", function() {

    //-------------Contracts----------
    var twapOracle;
    var oracleAggregator;
    var daiWeth, daiWethAddress;
    var weth;
    var dai;
    var router;

    //-------------Signers------------
    var deployer;
    var wethWhale;
    var daiWhale;

    this.timeout(0);
    
    beforeEach(async function(){
      await network.provider.request({
        method: "hardhat_reset",
        params: [{
          forking: {
            jsonRpcUrl: `https://eth-mainnet.alchemyapi.io/v2/${network.config.ALCHEMY_MAINNET}`,
            blockNumber: 12450260
          }
        }]
      });

      [deployer] = await ethers.getSigners();

      await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: ["0x56178a0d5F301bAf6CF3e1Cd53d9863437345Bf9"]}
      );
      
      wethWhale = await ethers.provider.getSigner("0x56178a0d5F301bAf6CF3e1Cd53d9863437345Bf9");

      await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: ["0x3f5CE5FBFe3E9af3971dD833D26bA9b5C936f0bE"]}
      );

      daiWhale = await ethers.provider.getSigner("0x56178a0d5F301bAf6CF3e1Cd53d9863437345Bf9");
      
      const _twapOracle = await ethers.getContractFactory("TwapOracle");

      twapOracle = await _twapOracle.deploy(FACTORY, 0, 0, INIT_CODE_HASH);

      oracleAggregator = await ethers.getContractAt(oracleAggregator_abi, OA);

      weth = await ethers.getContractAt(ierc20_abi, WETH);

      dai = await ethers.getContractAt(ierc20_abi, DAI);
      
      daiWethAddress = getCreate2Address(
        FACTORY,
        keccak256(['bytes'], [pack(['address', 'address'], [DAI, WETH])]),
        INIT_CODE_HASH
      );

      daiWeth = await ethers.getContractAt("IUniswapV2Pair", daiWethAddress);

      router = await ethers.getContractAt(router_abi, ROUTER);

      await mineBlocks(1);
    })
    
    it("🧊 5 minutes neutral", async function(){
        await startTest(10, FIVE_MIN, MARKET.NEUT);
    })
    it("🌕 5 minutes bullish", async function(){
        await startTest(10, FIVE_MIN, MARKET.BULL);
    })
    it("📉 5 minutes bearish", async function(){
        await startTest(10, FIVE_MIN, MARKET.BEAR);
    })

    it("🧊 15 minutes neutral", async function(){
        console.log("\n")
        await startTest(10, FIFTEEN_MIN, MARKET.NEUT);
    })
    it("🌕 15 minutes bullish", async function(){
        await startTest(10, FIFTEEN_MIN, MARKET.BULL);
    })
    it("📉 15 minutes bearish", async function(){
        await startTest(10, FIFTEEN_MIN, MARKET.BEAR);
    })

    it("🧊 30 minutes neutral", async function(){
        console.log("\n")
        await startTest(5, HALF_HOUR, MARKET.NEUT);
    })
    it("🌕 30 minutes bullish", async function(){
        await startTest(5, HALF_HOUR, MARKET.BULL);
    })
    it("📉 30 minutes bearish", async function(){
        await startTest(5, HALF_HOUR, MARKET.BEAR);
    })
    
    it("🧊 1 hour neutral", async function(){
        console.log("\n")
        await startTest(4, ONE_HOUR, MARKET.NEUT);
    })
    it("🌕 1 hour bullish", async function(){
        await startTest(4, ONE_HOUR, MARKET.BULL);
    })
    it("📉 1 hour bearish", async function(){
        await startTest(4, ONE_HOUR, MARKET.BEAR);
    })
    



    

   const startTest = async(sampleSize, _period, market) => {
        var percentages = [];

        for(let x=0; x < sampleSize; x++){
            percentages.push(await getPercentageDifference(_period, market));
        }

        const averagePercentageDifference = arrayAverage(percentages);                
        console.log("Average percentage difference: ", averagePercentageDifference);    
   }

    // buy or sell every 10 seconds;
    // percent closer to 1 == more sell 
    // percent closer to 0 == more buy
    const randomPriceMovement = async(_period, percent) => {
        priceAction_start = await getTime();
        priceAction_end = priceAction_start + _period
        do{
            now = await getTime();
            var random_boolean = Math.random() < percent;
            // console.log(random_boolean)
            if(random_boolean){
                await sellWeth(now);
            } else {
                await buyWeth(now);
            }
            await fastForwardTime(10);
            await mineBlocks(1);
        } while(now < priceAction_end);
    }

    const sellWeth = async(now) => {
        // console.log("selling")
        weth = weth.connect(wethWhale);
        router = router.connect(wethWhale);
        deadline = now + 10;

        await weth.approve(ROUTER, ethers.utils.parseEther("10"));
        await router.swapExactTokensForTokens(
            ethers.utils.parseEther("10"), 
            ethers.utils.parseEther("1"),
            [WETH, DAI], 
            wethWhale._address, 
            deadline
        );
    }

    const buyWeth = async(now) => {
        // console.log("buying")
        dai = dai.connect(daiWhale);
        router = router.connect(daiWhale);
        deadline = now + 10;

        await dai.approve(ROUTER, ethers.utils.parseEther("40000"));
        await router.swapExactTokensForTokens(
            ethers.utils.parseEther("40000"), 
            ethers.utils.parseEther("1"),
            [DAI, WETH], 
            daiWhale._address, 
            deadline
        );
    }

    const getPercentageDifference = async(_period, percent) => {
        await twapOracle.setPeriod(_period);
        await twapOracle.setMaxPeriod(2 * _period);
        await twapOracle.exec(1, PATH);
        await mineBlocks(1);

        const getAmountsOut_before = await router.getAmountsOut(ethers.utils.parseEther("1"), PATH);
        
        const balance_before = ethers.utils.formatEther(await weth.balanceOf(wethWhale._address));
        
        await randomPriceMovement(_period, percent);
        
        const balance_after_weth = ethers.utils.formatEther(await weth.balanceOf(wethWhale._address));
        const balance_after_dai = ethers.utils.formatEther(await dai.balanceOf(daiWhale._address));
        
        const getAmountsOut_after = await router.getAmountsOut(ethers.utils.parseEther("1"), PATH);

        const twapPrice = await twapOracle.getPrice(1, ethers.utils.parseEther("1"));


        // console.log("balance after dai: ", balance_after_dai);
        // console.log("balance after weth: ", balance_after_weth);
        // console.log("getAmountsOut before: ", ethers.utils.formatEther(getAmountsOut_before[1]));
        // console.log("getAmountsOut after: ", ethers.utils.formatEther(getAmountsOut_after[1]));
        // console.log("twap price: ", ethers.utils.formatEther(twapPrice));

        // console.log(twapPrice)
        // console.log(getAmountsOut_after[1])
        const difference = Math.abs(twapPrice / 10 ** 18 - getAmountsOut_after[1] / 10 ** 18);
        // console.log(difference);
        const average = (twapPrice / 10 ** 18 + getAmountsOut_after[1] / 10 ** 18) / 2;
        const percentageDifference = difference / average * 100;
        // console.log(percentageDifference);
        
        return percentageDifference;
    }

    const getTime = async() => {
        time = (await ethers.provider.getBlock()).timestamp;
        return time;
    }

    function arrayAverage(arr){
        var sum = 0;
        for(var i in arr) {
            sum += arr[i];
        }

        var count = arr.length;

        return (sum / count);
    }
   
});


