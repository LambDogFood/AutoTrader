require('dotenv').config();

const { loadConfig } = require('./Utilities/reader.js');
var updateTime = 30000
var closeTime = 60000 * 15

class LongShortBot {
  constructor(profile) {
    const config = loadConfig().profiles[profile];

    this.Alpaca = require("@alpacahq/alpaca-trade-api");
    this.alpaca = new this.Alpaca({
      keyId: config.apiKey,
      secretKey: config.apiSecret,
      paper: config.paper,
    });

    this.allStocks = config.stocks || []
    var temp = [];
    this.allStocks.forEach((stockName) => {
      temp.push({ name: stockName, pc: 0 });
    });
    this.allStocks = temp.slice();

    this.running = false;
    this.lastUpdated = new Date().toISOString();
    this.logs = [];
    this.qShort = null;
    this.qLong = null;
    this.adjustedQLong = null;
    this.adjustedQShort = null;
    this.blacklist = new Set();
    this.longAmount = 0;
    this.shortAmount = 0;
    this.timeToClose = null;
  }

  async run() {
    var orders;
    await this.alpaca
      .getOrders({
        status: "open",
        direction: "desc",
      })
      .then((resp) => {
        orders = resp;
      })
      .catch((err) => {
        this.log(err.error, 3);
      });
    var promOrders = [];
    orders.forEach((order) => {
      promOrders.push(
        new Promise(async (resolve, reject) => {
          await this.alpaca.cancelOrder(order.id).catch((err) => {
            this.log(err.error, 3);
          });
          resolve();
        })
      );
    });
    await Promise.all(promOrders);

    this.log("Waiting for market to open...", 1);
    var promMarket = this.awaitMarketOpen();
    await promMarket;
    this.log("Market opened.", 1);

    var spin = setInterval(async () => {
      this.lastUpdated = new Date().toISOString()

      await this.alpaca
        .getClock()
        .then((resp) => {
          var closingTime = new Date(
            resp.next_close.substring(0, resp.next_close.length - 6)
          );
          var currTime = new Date(
            resp.timestamp.substring(0, resp.timestamp.length - 6)
          );
          this.timeToClose = Math.abs(closingTime - currTime);
        })
        .catch((err) => {
          this.log(err.error), 3;
        });

      if (this.timeToClose < closeTime) {
        this.log("Market closing soon.  Closing positions.", 1)

        await this.alpaca
          .getPositions()
          .then(async (resp) => {
            var promClose = [];
            resp.forEach((position) => {
              promClose.push(
                new Promise(async (resolve, reject) => {
                  var orderSide;
                  if (position.side == "long") orderSide = "sell";
                  else orderSide = "buy";
                  var quantity = Math.abs(position.qty);
                  await this.submitOrder(quantity, position.symbol, orderSide);
                  resolve();
                })
              );
            });

            await Promise.all(promClose);
          })
          .catch((err) => {
            this.log(err.error, 3);
          });
        clearInterval(spin);
        this.log("Sleeping until market close (15 minutes).", 1);
        setTimeout(() => {
          this.run();
        }, closeTime);
      } else {
        await this.rebalance();
      }
    }, updateTime);
  }

  awaitMarketOpen() {
    var prom = new Promise(async (resolve, reject) => {
      var isOpen = false;
      await this.alpaca.getClock().then(async (resp) => {
        if (resp.is_open) {
          resolve();
        } else {
          var marketChecker = setInterval(async () => {
            await this.alpaca
              .getClock()
              .then((resp) => {
                isOpen = resp.is_open;
                if (isOpen) {
                  clearInterval(marketChecker);
                  resolve();
                } else {
                  var openTime = new Date(
                    resp.next_open.substring(0, resp.next_close.length - 6)
                  );
                  var currTime = new Date(
                    resp.timestamp.substring(0, resp.timestamp.length - 6)
                  );
                  this.timeToClose = Math.floor(
                    (openTime - currTime) / 1000 / 60
                  );
                }
              })
              .catch((err) => {
                this.log(err.error, 3);
              });
          }, updateTime);
        }
      });
    });
    return prom;
  }

  async submitOrder(quantity, stock, side) {
    var prom = new Promise(async (resolve, reject) => {
      if (quantity > 0) {
        await this.alpaca
          .createOrder({
            symbol: stock,
            qty: quantity,
            side: side,
            type: "market",
            time_in_force: "day",
          })
          .then(() => {
            this.log(
              "Market order of | " +
                quantity +
                " " +
                stock +
                " " +
                side +
                " | completed."
            , 2);
            resolve(true);
          })
          .catch((err) => {
            this.log(
              "Order of | " +
                quantity +
                " " +
                stock +
                " " +
                side +
                " | did not go through."
            , 2);
            resolve(false);
          });
      } else {
        this.log(
          "Quantity is <=0, order of | " +
            quantity +
            " " +
            stock +
            " " +
            side +
            " | not sent."
        , 2);
        resolve(true);
      }
    });
    return prom;
  }

  async rebalance() {
    await this.rerank();

    var orders;
    await this.alpaca
      .getOrders({
        status: "open",
        direction: "desc",
      })
      .then((resp) => {
        orders = resp;
      })
      .catch((err) => {
        this.log(err.error, 3);
      });
    var promOrders = [];
    orders.forEach((order) => {
      promOrders.push(
        new Promise(async (resolve, reject) => {
          await this.alpaca.cancelOrder(order.id).catch((err) => {
            this.log(err.error, 3);
          });
          resolve();
        })
      );
    });
    await Promise.all(promOrders);

    this.log("Taking a long position in: " + this.long.toString(), 1);
    this.log("Taking a short position in: " + this.short.toString(), 1);

    var positions;
    await this.alpaca
      .getPositions()
      .then((resp) => {
        positions = resp;
      })
      .catch((err) => {
        this.log(err.error, 3);
      });
    var promPositions = [];
    var executed = { long: [], short: [] };
    var side;
    this.blacklist.clear();

    positions.forEach((position) => {
      promPositions.push(
        new Promise(async (resolve, reject) => {
          if (this.long.indexOf(position.symbol) < 0) {
            if (this.short.indexOf(position.symbol) < 0) {
              if (position.side == "long") side = "sell";
              else side = "buy";
              var promCO = this.submitOrder(
                Math.abs(position.qty),
                position.symbol,
                side
              );
              await promCO.then(() => {
                resolve();
              });
            } else {
              if (position.side == "long") {
                var promCS = this.submitOrder(
                  position.qty,
                  position.symbol,
                  "sell"
                );
                await promCS.then(() => {
                  resolve();
                });
              } else {
                if (Math.abs(position.qty) == this.qShort) {
                } else {
                  var diff =
                    Number(Math.abs(position.qty)) - Number(this.qShort);
                  if (diff > 0) {
                    side = "buy";
                  } else {
                    side = "sell";
                  }
                  var promRebalance = this.submitOrder(
                    Math.abs(diff),
                    position.symbol,
                    side
                  );
                  await promRebalance;
                }
                executed.short.push(position.symbol);
                this.blacklist.add(position.symbol);
                resolve();
              }
            }
          } else {
            if (position.side == "short") {
              var promCS = this.submitOrder(
                Math.abs(position.qty),
                position.symbol,
                "buy"
              );
              await promCS.then(() => {
                resolve();
              });
            } else {
              if (position.qty == this.qLong) {
              } else {
                var diff = Number(position.qty) - Number(this.qLong);
                if (diff > 0) {
                  side = "sell";
                } else {
                  side = "buy";
                }
                var promRebalance = this.submitOrder(
                  Math.abs(diff),
                  position.symbol,
                  side
                );
                await promRebalance;
              }
              executed.long.push(position.symbol);
              this.blacklist.add(position.symbol);
              resolve();
            }
          }
        })
      );
    });
    await Promise.all(promPositions);

    var promLong = this.sendBatchOrder(this.qLong, this.long, "buy");
    var promShort = this.sendBatchOrder(this.qShort, this.short, "sell");

    var promBatches = [];
    this.adjustedQLong = -1;
    this.adjustedQShort = -1;

    await Promise.all([promLong, promShort])
      .then(async (resp) => {
        resp.forEach(async (arrays, i) => {
          promBatches.push(
            new Promise(async (resolve, reject) => {
              if (i == 0) {
                arrays[1] = arrays[1].concat(executed.long);
                executed.long = arrays[1].slice();
              } else {
                arrays[1] = arrays[1].concat(executed.short);
                executed.short = arrays[1].slice();
              }
              if (arrays[0].length > 0 && arrays[1].length > 0) {
                var promPrices = this.getTotalPrice(arrays[1]);

                await Promise.all(promPrices).then((resp) => {
                  var completeTotal = resp.reduce((a, b) => a + b, 0);
                  if (completeTotal != 0) {
                    if (i == 0) {
                      this.adjustedQLong = Math.floor(
                        this.longAmount / completeTotal
                      );
                    } else {
                      this.adjustedQShort = Math.floor(
                        this.shortAmount / completeTotal
                      );
                    }
                  }
                });
              }
              resolve();
            })
          );
        });
        await Promise.all(promBatches);
      })
      .then(async () => {
        var promReorder = new Promise(async (resolve, reject) => {
          var promLong = [];
          if (this.adjustedQLong >= 0) {
            this.qLong = this.adjustedQLong - this.qLong;
            executed.long.forEach(async (stock) => {
              promLong.push(
                new Promise(async (resolve, reject) => {
                  var promLong = this.submitOrder(this.qLong, stock, "buy");
                  await promLong;
                  resolve();
                })
              );
            });
          }

          var promShort = [];
          if (this.adjustedQShort >= 0) {
            this.qShort = this.adjustedQShort - this.qShort;
            executed.short.forEach(async (stock) => {
              promShort.push(
                new Promise(async (resolve, reject) => {
                  var promShort = this.submitOrder(this.qShort, stock, "sell");
                  await promShort;
                  resolve();
                })
              );
            });
          }
          var allProms = promLong.concat(promShort);
          if (allProms.length > 0) {
            await Promise.all(allProms);
          }
          resolve();
        });
        await promReorder;
      });
  }

  async rerank() {
    await this.rank();

    var longShortAmount = Math.floor(this.allStocks.length / 4);
    this.long = [];
    this.short = [];
    for (var i = 0; i < this.allStocks.length; i++) {
      if (i < longShortAmount) this.short.push(this.allStocks[i].name);
      else if (i > this.allStocks.length - 1 - longShortAmount)
        this.long.push(this.allStocks[i].name);
      else continue;
    }

    var equity;
    await this.alpaca
      .getAccount()
      .then((resp) => {
        equity = resp.equity;
      })
      .catch((err) => {
        this.log(err.error, 3);
      });
    this.shortAmount = 0.3 * equity;
    this.longAmount = Number(this.shortAmount) + Number(equity);

    var promLong = this.getTotalPrice(this.long);
    var promShort = this.getTotalPrice(this.short);
    var longTotal;
    var shortTotal;
    await Promise.all(promLong).then((resp) => {
      longTotal = resp.reduce((a, b) => a + b, 0);
    });
    await Promise.all(promShort).then((resp) => {
      shortTotal = resp.reduce((a, b) => a + b, 0);
    });

    this.qLong = Math.floor(this.longAmount / longTotal);
    this.qShort = Math.floor(this.shortAmount / shortTotal);
  }

  async rank() {
    var promStocks = this.getPercentChanges(this.allStocks);
    await Promise.all(promStocks);

    this.allStocks.sort((a, b) => {
      return a.pc - b.pc;
    });
  }

  async getTotalPrice(stock) {
    try {
      const bars = await this.alpaca.getBarsV2(
        stock,
        { timeframe: this.alpaca.newTimeframe(1, this.alpaca.timeframeUnit.MIN), limit: 1 },
        this.alpaca.configuration
      );

      for await (let b of bars) {
        return b.ClosePrice;
      }
    } catch (error) {
      this.log(error.message, 3);
      return 0;
    }
  }

  async sendBatchOrder(quantity, stocks, side) {
    var prom = new Promise(async (resolve, reject) => {
      var incomplete = [];
      var executed = [];
      var promOrders = [];
      stocks.forEach(async (stock) => {
        promOrders.push(
          new Promise(async (resolve, reject) => {
            if (!this.blacklist.has(stock)) {
              var promSO = this.submitOrder(quantity, stock, side);
              await promSO.then((resp) => {
                if (resp) executed.push(stock);
                else incomplete.push(stock);
                resolve();
              });
            } else resolve();
          })
        );
      });
      await Promise.all(promOrders).then(() => {
        resolve([incomplete, executed]);
      });
    });
    return prom;
  }

  getPercentChanges(allStocks) {
    var length = 50;
    var promStocks = [];

    allStocks.forEach((stock) => {
      promStocks.push(
        new Promise(async (resolve, reject) => {
          try {
            const bars = this.alpaca.getBarsV2(
              stock.name,
              {
                timeframe: this.alpaca.newTimeframe(
                  1,
                  this.alpaca.timeframeUnit.MIN
                ),
                limit: length,
              },
              this.alpaca.configuration
            );

            for await (let b of bars) {
              const closing = b.ClosePrice;
              const opening = b.OpenPrice;
              const pc = (closing - opening) / opening;

              stock.pc = pc;
            }
          } catch (err) {
            this.log(err, 3);
          }

          resolve();
        })
      );
    });

    return promStocks
  };

  async rank() {
    var promStocks = this.getPercentChanges(this.allStocks);
    await Promise.all(promStocks);

    this.allStocks.sort((a, b) => {
      return a.pc - b.pc;
    });
  };

  async log(log="Unknown error occured.", logType=1) {
    this.logs.push({log, logType});
    if (logType === 3) {
      console.log(log) // Error
    }
  }

  fetchRunDown() {
    return {
      running: this.running,
      lastUpdated: this.lastUpdated,
      rankings: this.allStocks,
      logs: this.logs,
    };
  }
}

const bots = {};

function initAllAccounts() {
  const accounts = loadConfig().profiles;

  for (const accountName in accounts) {

    var createdBot = new LongShortBot(accountName);
    createdBot.run()

    bots[accountName] = createdBot
  }
}; initAllAccounts();

module.exports = { LongShortBot, bots }