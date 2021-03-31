const et = require('./lib/eTestLib');

et.testSet({
    desc: "borrow basic",

    preActions: ctx => {
        let actions = [];

        for (let from of [ctx.wallet, ctx.wallet2]) {
            actions.push({ from, send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });
            actions.push({ from, send: 'tokens.TST2.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });
        }

        for (let from of [ctx.wallet, ctx.wallet2]) {
            actions.push({ from, send: 'tokens.TST.mint', args: [from.address, et.eth(100)], });
        }

        for (let from of [ctx.wallet2]) {
            actions.push({ from, send: 'tokens.TST2.mint', args: [from.address, et.eth(100)], });
        }

        actions.push({ from: ctx.wallet, send: 'eTokens.eTST.deposit', args: [0, et.eth(1)], });

        actions.push({ from: ctx.wallet2, send: 'eTokens.eTST2.deposit', args: [0, et.eth(50)], });
        actions.push({ from: ctx.wallet2, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST2.address], },);

        actions.push({ action: 'updateUniswapPrice', pair: 'TST/WETH', price: '.01', });
        actions.push({ action: 'updateUniswapPrice', pair: 'TST2/WETH', price: '.05', });

        actions.push({ action: 'jumpTime', time: 31*60, });

        return actions;
    },
})


.test({
    desc: "basic borrow and repay, with no interest",
    actions: ctx => [
        { action: 'setIRM', underlying: 'TST', irm: 'IRM_ZERO', },

        { call: 'markets.getEnteredMarkets', args: [ctx.wallet2.address],
          assertEql: [ctx.contracts.tokens.TST2.address], },

        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(.4)], },
        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(.1)], },
        { action: 'checkpointTime', },

        // Make sure the borrow entered us into the market
        { call: 'markets.getEnteredMarkets', args: [ctx.wallet2.address],
          assertEql: [ctx.contracts.tokens.TST2.address, ctx.contracts.tokens.TST.address], },

        { call: 'tokens.TST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(100.5), },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(0), },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth('0.500000000000000001'), },

        // Wait 1 day

        { action: 'jumpTime', time: 86400, },
        { action: 'mineEmptyBlock', },

        // No interest was charged

        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth('0.500000000000000001'), },

        { from: ctx.wallet2, send: 'dTokens.dTST.repay', args: [0, et.eth('0.500000000000000001')], },

        { call: 'tokens.TST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth('99.999999999999999999'), },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(0), },
        { call: 'dTokens.dTST.balanceOfExact', args: [ctx.wallet2.address], assertEql: et.eth(0), },

        { call: 'dTokens.dTST.totalSupply', args: [], assertEql: et.eth(0), },
        { call: 'dTokens.dTST.totalSupplyExact', args: [], assertEql: et.eth(0), },
    ],
})



.test({
    desc: "basic borrow and repay, very small interest",
    actions: ctx => [
        { call: 'markets.interestAccumulator', args: [ctx.contracts.tokens.TST.address], assertEql: et.units(1, 27), },

        { action: 'setIRM', underlying: 'TST', irm: 'IRM_FIXED', },

        { call: 'markets.interestAccumulator', args: [ctx.contracts.tokens.TST.address], assertEql: et.units(1, 27), },

        // Mint some extra so we can pay interest
        { send: 'tokens.TST.mint', args: [ctx.wallet2.address, et.eth(0.1)], },
        { call: 'markets.interestAccumulator', args: [ctx.contracts.tokens.TST.address], assertEql: et.units('1.000000003170979198376458650', 27), },

        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(.5)], },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth('0.500000000000000001'), },

        { call: 'markets.interestAccumulator', args: [ctx.contracts.tokens.TST.address], assertEql: et.units('1.000000006341958406808026377', 27), }, // 1 second later, so previous accumulator squared

        // 1 block later

        { action: 'mineEmptyBlock', },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth('0.500000001585489600'), },

        // Try to pay off full amount:

        { from: ctx.wallet2, send: 'dTokens.dTST.repay', args: [0, et.eth('0.500000001585489600')], },

        // Tiny bit more accrued in previous block:

        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth('.000000001585489605'), },

        // Use max uint to actually pay off full amount:

        { from: ctx.wallet2, send: 'dTokens.dTST.repay', args: [0, et.MaxUint256], },

        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(0), },
        { call: 'dTokens.dTST.balanceOfExact', args: [ctx.wallet2.address], assertEql: et.eth(0), },

        { call: 'dTokens.dTST.totalSupply', args: [], assertEql: et.eth(0), },
        { call: 'dTokens.dTST.totalSupplyExact', args: [], assertEql: et.eth(0), },
    ],
})



.run();