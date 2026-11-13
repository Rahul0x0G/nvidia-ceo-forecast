# NVIDIA CEO price forecaster

Quantile forecasts of Polymarket's "Next CEO of NVIDIA?" Yes prices, 240 minutes ahead (Node 22, standard library only).

Each market keeps its last price as the centre, with a random-walk spread scaled by how often that market's price
moved over the last 24 hours.

Run locally: `MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts`

`tools/backtest.mjs` and `tools/tune.mjs` score the forecaster on the kit's practice cases.
