const { AlpacaService } = require('../../Alpaca/AlpacaService')

const MINUTE = 60_000
const THIRTY_SECONDS = 30

class LongShortService {
  constructor( keyId, secretKey, paper, symbols, bucketPct = 0.25 ) {
    this.alpaca = new AlpacaService({
      keyId: keyId,
      secretKey: secretKey,
      paper: paper,
    })

    this.timeToClose = null

    this.stockList = symbols.map(item => ({ name: item, pc: 0 }))

    this.long = []
    this.short = []
    this.qShort = null
    this.qLong = null
    this.adjustedQLong = null
    this.adjustedQShort = null
    this.blacklist = new Set()
    this.longAmount = 0
    this.shortAmount = 0
    this.timeToClose = null
    this.bucketPct = bucketPct
  }

  async run() {
    await this.alpaca.cancelExistingOrders()

    console.log('Waiting for market to open...')
    await this.alpaca.awaitMarketOpen()
    console.log('Market opened.')

    await this.rebalancePorfolio(THIRTY_SECONDS)
  }

  async rebalancePorfolio(seconds) {
    const spin = setInterval(async () => {
      const INTERVAL = 15 // minutes
      this.timeToClose = await this.alpaca.getTimeToClose()

      if (this.timeToClose < MINUTE * INTERVAL) {
        console.log('Market closing soon. Closing positions.')

        try {
          const positions = await this.alpaca.instance.getPositions()

          await Promise.all(
            positions.map(position =>
              this.alpaca.submitOrder({
                quantity: Math.abs(position.qty),
                stock: position.symbol,
                side:
                  position.side === "long"
                    ? "sell"
                    : "buy",
              }),
            ),
          )
        } catch (err) {
          console.error(err.error)
        }

        clearInterval(spin)
        console.log(`Sleeping until market close (${INTERVAL} minutes).`)

        setTimeout(() => {
          this.run()
        }, MINUTE * INTERVAL)
      } else {
        await this.rebalance()
      }
    }, seconds * 1000)
  }

  getPercentChanges(limit = 10) {
    return Promise.all(
      this.stockList.map(stock => {
        return new Promise(async resolve => {
          try {
            const resp = this.alpaca.instance.getBarsV2(
              stock.name,
              {
                timeframe: this.alpaca.instance.newTimeframe(
                  1,
                  this.alpaca.instance.timeframeUnit.MIN
                ),
                limit: limit,
              },
              this.alpaca.instance.configuration
            );

            for await (let bar of resp) {
              if (this.alpaca.instance.configuration.usePolygon) {
                const closing = bar.c;
                const opening = bar.o;
                stock.pc = (closing - opening) / opening;
              } else {
                const closing = bar.ClosePrice;
                const opening = bar.OpenPrice;
                stock.pc = (closing - opening) / opening;
              }
            }
          } catch (err) {
            console.error(`Could not get bars: ${err.message}`)
          }
          resolve()
        })
      }),
    )
  }

  async rank()  {
    await this.getPercentChanges()

    this.stockList.sort((a, b) => {
      return a.pc - b.pc
    })
  }

  async rerank()  {
    await this.rank()
    const bucketSize = Math.floor(this.stockList.length * this.bucketPct)

    this.short = this.stockList.slice(0, bucketSize).map(item => item.name)
    this.long = this.stockList
      .slice(this.stockList.length - bucketSize)
      .map(item => item.name)

    try {
      const result = await this.alpaca.instance.getAccount()
      this.shortAmount = result.equity * 0.3
      this.longAmount = Number(this.shortAmount) + Number(result.equity)
    } catch (err) {
      console.error(err.error)
    }

    try {
      const longPrices = await this.getTotalPrice(this.long)
      const longTotal = longPrices.reduce((a, b) => a + b, 0)
      this.qLong = Math.floor(this.longAmount / longTotal)
    } catch (err) {
      console.error(err.error)
    }

    try {
      const shortPrices = await this.getTotalPrice(this.short)
      const shortTotal = shortPrices.reduce((a, b) => a + b, 0)
      this.qShort = Math.floor(this.shortAmount / shortTotal)
    } catch (err) {
      console.error(err.error)
    }
  }

  async getTotalPrice(stocks = [])  {
    return Promise.all(
      stocks.map(stock => {
        return new Promise(async resolve => {
          try {
            const resp = await this.alpaca.instance.getBarsV2(
              stock,
              {
                timeframe: this.alpaca.instance.newTimeframe(
                  1,
                  this.alpaca.instance.timeframeUnit.MIN
                ),
                limit: 1,
              },
              this.alpaca.instance.configuration
            );

            for await (let bar of resp) {
              if (this.alpaca.instance.configuration.usePolygon) {
                resolve(bar.c)
              } else {
                resolve(bar.ClosePrice)
              }
            }
          } catch (err) {
            console.error(`Could not get bars2: ${err.message}`)
          }
        })
      }),
    )
  }

  async rebalance() {
    await this.rerank()
    await this.alpaca.cancelExistingOrders()

    console.log(`We are taking a long position in: ${this.long.toString()}`)
    console.log(
      `We are taking a short position in: ${this.short.toString()}`,
    )

    let positions
    try {
      positions = await this.alpaca.instance.getPositions()
    } catch (err) {
      console.error(err.error)
    }

    const executed = { long: [], short: [] }

    this.blacklist.clear()

    await Promise.all(
      positions.map(position => {
        return new Promise(async (resolve, reject) => {
          const quantity = Math.abs(position.qty)
          const symbol = position.symbol

          if (this.long.indexOf(symbol) < 0) {
            if (this.short.indexOf(symbol) < 0) {
              try {
                await this.alpaca.submitOrder({
                  quantity,
                  stock: symbol,
                  side:
                    position.side === "long"
                      ? "sell"
                      : "buy",
                })
                resolve()
              } catch (err) {
                console.error(err.error)
              }
            } else if (position.side === "long") {
              try {
                await this.alpaca.submitOrder({
                  quantity,
                  stock: symbol,
                  side: "sell",
                })
                resolve()
              } catch (err) {
                console.error(err.error)
              }
            } else {
              if (quantity !== this.qShort) {
                const diff = Number(quantity) - Number(this.qShort)
                try {
                  await this.alpaca.submitOrder({
                    quantity: Math.abs(diff),
                    stock: symbol,
                    side:
                      diff > 0
                        ? "buy"
                        : "sell",
                  })
                } catch (err) {
                  console.error(err.error)
                }
              }
              executed.short.push(symbol)
              this.blacklist.add(symbol)
              resolve()
            }
          } else if (position.side === "short") {
            try {
              await this.alpaca.submitOrder({
                quantity,
                stock: symbol,
                side: "buy",
              })
              resolve()
            } catch (err) {
              console.error(err.error)
            }
          } else {
            if (quantity !== this.qLong) {
              const diff = Number(quantity) - Number(this.qLong)
              const side =
                diff > 0 ? "sell" : "buy"
              try {
                await this.alpaca.submitOrder({
                  quantity: Math.abs(diff),
                  stock: symbol,
                  side,
                })
              } catch (err) {
                console.error(err.error)
              }
            }
            executed.long.push(symbol)
            this.blacklist.add(symbol)
            resolve()
          }
        })
      }),
    )

    this.adjustedQLong = -1
    this.adjustedQShort = -1

    try {
      const [longOrders, shortOrders] = await Promise.all([
        this.sendBatchOrder({
          quantity: this.qLong,
          stocks: this.long,
          side: "buy"
        }),
        this.sendBatchOrder({
          quantity: this.qShort,
          stocks: this.short,
          side: "sell",
        }),
      ])

      executed.long = longOrders.executed.slice()
      executed.short = shortOrders.executed.slice()

      if (longOrders.incomplete.length > 0 && longOrders.executed.length > 0) {
        const prices = await this.getTotalPrice(longOrders.executed)
        const completeTotal = prices.reduce((a, b) => a + b, 0)
        if (completeTotal !== 0) {
          this.adjustedQLong = Math.floor(this.longAmount / completeTotal)
        }
      }

      if (
        shortOrders.incomplete.length > 0 &&
        shortOrders.executed.length > 0
      ) {
        const prices = await this.getTotalPrice(shortOrders.executed)
        const completeTotal = prices.reduce((a, b) => a + b, 0)
        if (completeTotal !== 0) {
          this.adjustedQShort = Math.floor(this.shortAmount / completeTotal)
        }
      }
    } catch (err) {
      console.error(err.error)
    }

    try {
      await new Promise(async resolve => {
        let allProms = []

        if (this.adjustedQLong >= 0) {
          this.qLong = this.adjustedQLong - this.qLong
          allProms = [
            ...allProms,
            ...executed.long.map(stock =>
              this.alpaca.submitOrder({
                quantity: this.qLong,
                stock,
                side: "buy",
              }),
            ),
          ]
        }

        if (this.adjustedQShort >= 0) {
          this.qShort = this.adjustedQShort - this.qShort
          allProms = [
            ...allProms,
            ...executed.short.map(stock =>
              this.alpaca.submitOrder({
                quantity: this.qShort,
                stock,
                side: "sell",
              }),
            ),
          ]
        }

        if (allProms.length > 0) {
          await Promise.all(allProms)
        }

        resolve()
      })
    } catch (err) {
      console.error(err.error, 'Reorder stocks try, catch')
    }
  }

  async sendBatchOrder({
    quantity,
    stocks,
    side,
  }) {
    return new Promise(async resolve => {
      const incomplete = []
      const executed = []

      await Promise.all(
        stocks.map(stock => {
          return new Promise(async resolve => {
            if (!this.blacklist.has(stock)) {
              try {
                const isSubmitted = await this.alpaca.submitOrder({
                  quantity,
                  stock,
                  side,
                })

                if (isSubmitted) {
                  executed.push(stock)
                } else {
                  incomplete.push(stock)
                }
              } catch (err) {
                console.error(err.error, 'sendBatchOrder')
              }
            }
            resolve()
          })
        }),
      )
      resolve({ incomplete, executed })
    })
  }
}

module.exports = { LongShortService }