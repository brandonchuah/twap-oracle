require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-ethers");

require('dotenv').config();

const ALCHEMY_MAINNET = process.env.ALCHEMY_MAINNET;
const ALCHEMY_ROPSTEN = process.env.ALCHEMY_ROPSTEN;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const ETHERSCAN_API = process.env.ETHERSCAN_API;

const addresses_mainnet = {
  ROUTER: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  FACTORY: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
  WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  UNI: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984",
  LINK: "0x514910771AF9Ca656af840dff83E8264EcF986CA",
  DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
  Gelato: "0x3CACa7b48D0573D793d3b0279b5F0029180E83b6",
  GelatoGasPriceOracle: "0x169E633A2D1E6c10dD91238Ba11c4A708dfEF37C",
}

const addresses_polygon = {
  QUICK: "0x831753DD7087CaC61aB5644b308642cc1c33Dc13",
  ROUTER: "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff",
  FACTORY: "0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32",
  WETH: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
  DAI: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063",
  UNI: "0xb33EaAd8d922B1083446DC23f610c2567fB5180f",
  LINK: "0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39"
}

const addresses_ropsten = {
  ETH: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
  Gelato: "0xCc4CcD69D31F9FfDBD3BFfDe49c6aA886DaB98d9",
  GelatoGasPriceOracle: "0x20F44678Fc2344a78E84192e82Cede989Bf1da6F",
}


module.exports = {
  solidity: {
    version: "0.8.0",
  },
  networks: {
    hardhat: {
  
      // forking: {
      //   url: `https://rpc-mainnet.maticvigil.com/`,
      //   blockNumber: 14722000
      // },
      forking: {
        url: `https://eth-mainnet.alchemyapi.io/v2/${ALCHEMY_MAINNET}`,
        blockNumber: 12450260,
      },
      mining: {
        auto: false
      },
      ...addresses_mainnet,
      // ...addresses_polygon,
    },
    ropsten: {
      url: `https://eth-ropsten.alchemyapi.io/v2/${ALCHEMY_ROPSTEN}`,
      accounts: [PRIVATE_KEY],
      ...addresses_ropsten,
    },
    polygon: {
      url: `https://rpc-mainnet.maticvigil.com/`,
      accounts: [PRIVATE_KEY],
      ...addresses_polygon
    }
  },
  // etherscan: {
  //   // Your API key for Etherscan
  //   // Obtain one at https://etherscan.io/
  //   apiKey: ETHERSCAN_API
  // }
}

