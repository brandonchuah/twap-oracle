//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import {IUniswapV2Pair} from "./libraries/IUniswapV2Pair.sol";
import {UniswapV2Library} from "./libraries/UniswapV2Library.sol";
import {UniswapV2OracleLibrary} from "./libraries/UniswapV2OracleLibrary.sol";
import {FixedPoint} from "./libraries/FixedPoint.sol";
import {SafeMath} from "./libraries/SafeMath.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract TwapOracle is Ownable {
    using FixedPoint for *;

    struct Oracle {
        IUniswapV2Pair pair;
        address token0;
        address token1;
        uint256 price0CumulativeLast;
        uint256 price1CumulativeLast;
        uint32 blockTimestampLast;
    }

    address public immutable factory;
    bytes32 public immutable initHash;
    uint32 public period;
    uint32 public maxPeriod;

    mapping(uint256 => Oracle[]) public oraclesFromId;
    mapping(uint256 => address[]) public pathFromId;

    event LogTaskSubmitted(
        uint256 indexed id,
        uint256 startOracleTime,
        bool isSubmitAndExec
    );

    event LogOracles(uint256 indexed _id, Oracle[] oracles);

    constructor(
        address _factory,
        uint32 _period,
        uint32 _maxPeriod,
        bytes32 _initHash
    ) {
        factory = _factory;
        period = _period;
        maxPeriod = _maxPeriod;
        initHash = _initHash;
    }

    function exec(uint256 _id, address[] calldata _tradePath) external {
        startOracles(_id, _tradePath);
    }

    function getPrice(uint256 _id, uint256 amountIn)
        public
        view
        returns (uint256 price)
    {
        address[] memory storedPath = pathFromId[_id];
        Oracle[] memory _oracles = oraclesFromId[_id];

        price = updateAndGetPrice(_oracles[0], storedPath[0], amountIn);

        for (uint256 x = 1; x < _oracles.length; x++) {
            price = updateAndGetPrice(_oracles[x], storedPath[x], price);
        }
    }

    function setPeriod(uint32 _period) external onlyOwner {
        period = _period;
    }

    function setMaxPeriod(uint32 _maxPeriod) external onlyOwner {
        maxPeriod = _maxPeriod;
    }

    // to be plugged into GelatoDCA.sol
    // _updateAndSubmitNextTask()
    // submit()
    function getStartOracleTask(
        uint256 _id,
        uint256 delay,
        uint256 lastExecutionTime
    ) public {
        uint256 startOracleTime = lastExecutionTime + delay - period;

        emit LogTaskSubmitted(_id, startOracleTime, false);
    }

    function startOracles(uint256 _id, address[] calldata tradePath) internal {
        bool isNewId = oraclesFromId[_id].length == 0;
        for (uint256 x = 0; x < tradePath.length - 1; x++) {
            Oracle memory oracle = startOracle(tradePath[x], tradePath[x + 1]);

            if (isNewId) {
                //create oracles
                oraclesFromId[_id].push(oracle);
            } else {
                //update oracles
                oraclesFromId[_id][x].price0CumulativeLast = oracle
                    .price0CumulativeLast;
                oraclesFromId[_id][x].price1CumulativeLast = oracle
                    .price1CumulativeLast;
                oraclesFromId[_id][x].blockTimestampLast = oracle
                    .blockTimestampLast;
            }
        }
        pathFromId[_id] = tradePath;

        emit LogOracles(_id, oraclesFromId[_id]);
    }

    function startOracle(address token0, address token1)
        internal
        view
        returns (Oracle memory newOracle)
    {
        IUniswapV2Pair pair =
            IUniswapV2Pair(
                UniswapV2Library.pairFor(factory, token0, token1, initHash)
            );
        token0 = pair.token0();
        token1 = pair.token1();

        uint112 reserve0;
        uint112 reserve1;
        (reserve0, reserve1, ) = pair.getReserves();
        require(
            reserve0 != 0 && reserve1 != 0,
            "TwapOracle: startOracle: NO_RESERVES"
        );

        (
            uint256 _price0Cumulative,
            uint256 _price1Cumulative,
            uint32 _blockTimestamp
        ) = UniswapV2OracleLibrary.currentCumulativePrices(address(pair));
        newOracle = Oracle(
            pair,
            token0,
            token1,
            _price0Cumulative,
            _price1Cumulative,
            _blockTimestamp
        );
    }

    function updateAndGetPrice(
        Oracle memory _oracle,
        address token,
        uint256 amountIn
    ) internal view returns (uint256) {
        (
            uint256 price0Cumulative,
            uint256 price1Cumulative,
            uint32 blockTimestamp
        ) =
            UniswapV2OracleLibrary.currentCumulativePrices(
                address(_oracle.pair)
            );

        uint32 timeElapsed = blockTimestamp - _oracle.blockTimestampLast;

        require(
            isUpToDate(timeElapsed),
            "TwapOracle: updateAndGetPrice: TimeElapsed out of range."
        );

        return
            calculatePrice(
                token,
                _oracle.token0,
                _oracle.token1,
                amountIn,
                price0Cumulative,
                price1Cumulative,
                _oracle.price0CumulativeLast,
                _oracle.price1CumulativeLast,
                timeElapsed
            );
    }

    function calculatePrice(
        address token,
        address token0,
        address token1,
        uint256 amountIn,
        uint256 price0Cumulative,
        uint256 price1Cumulative,
        uint256 price0CumulativeLast,
        uint256 price1CumulativeLast,
        uint32 timeElapsed
    ) internal pure returns (uint256 amountOut) {
        // overflow is desired, casting never truncates
        // cumulative price is in (uq112x112 price * seconds) units so we simply wrap it after division by time elapsed
        FixedPoint.uq112x112 memory price0Average =
            FixedPoint.uq112x112(
                uint224((price0Cumulative - price0CumulativeLast) / timeElapsed)
            );
        FixedPoint.uq112x112 memory price1Average =
            FixedPoint.uq112x112(
                uint224((price1Cumulative - price1CumulativeLast) / timeElapsed)
            );

        if (token == token0) {
            amountOut = price0Average.mul(amountIn).decode144();
        } else {
            require(token == token1, "ExampleOracleSimple: INVALID_TOKEN");
            amountOut = price1Average.mul(amountIn).decode144();
        }
    }

    function isUpToDate(uint32 timeElapsed) internal view returns (bool) {
        return (timeElapsed >= period && timeElapsed <= maxPeriod);
    }
}
