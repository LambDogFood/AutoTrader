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
                  position.side === this.alpaca.positionType.LONG
                    ? this.alpaca.sideType.SELL
                    : this.alpaca.sideType.BUY,
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
            const resp = await this.alpaca.instance.getBars(
              'minute',
              stock.name,
              {
                limit: limit,
              },
            )
            if (this.alpaca.instance.configuration.usePolygon) {
              const l = resp[stock.name].length
              const last_close = resp[stock.name][l - 1].c
              const first_open = resp[stock.name][0].o
              stock.pc = (last_close - first_open) / first_open
            } else {
              const l = resp[stock.name].length
              const last_close = resp[stock.name][l - 1].closePrice
              const first_open = resp[stock.name][0].openPrice
              stock.pc = (last_close - first_open) / first_open
            }
          } catch (err) {
            console.error(err.message)
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
      const equity = result.equity
      this.shortAmount = 0.3 * equity
      this.longAmount = Number(this.shortAmount) + Number(equity)
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
            const resp = await this.alpaca.instance.getBars('minute', stock, {
              limit: 1,
            })
            if (this.alpaca.instance.configuration.usePolygon) {
              resolve(resp[stock][0].c)
            } else {
              resolve(resp[stock][0].closePrice)
            }
          } catch (err) {
            console.error(err.message)
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
      console.log(positions)
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
                    position.side === this.alpaca.positionType.LONG
                      ? this.alpaca.sideType.SELL
                      : this.alpaca.sideType.BUY,
                })
                resolve()
              } catch (err) {
                console.error(err.error)
              }
            } else if (position.side === this.alpaca.positionType.LONG) {
              try {
                await this.alpaca.submitOrder({
                  quantity,
                  stock: symbol,
                  side: this.alpaca.sideType.SELL,
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
                        ? this.alpaca.sideType.BUY
                        : this.alpaca.sideType.SELL,
                  })
                } catch (err) {
                  console.error(err.error)
                }
              }
              executed.short.push(symbol)
              this.blacklist.add(symbol)
              resolve()
            }
          } else if (position.side === this.alpaca.positionType.SHORT) {
            try {
              await this.alpaca.submitOrder({
                quantity,
                stock: symbol,
                side: this.alpaca.sideType.BUY,
              })
              resolve()
            } catch (err) {
              console.error(err.error)
            }
          } else {
            if (quantity !== this.qLong) {
              const diff = Number(quantity) - Number(this.qLong)
              const side =
                diff > 0 ? this.alpaca.sideType.SELL : this.alpaca.sideType.BUY
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
          side: this.alpaca.sideType.BUY,
        }),
        this.sendBatchOrder({
          quantity: this.qShort,
          stocks: this.short,
          side: this.alpaca.sideType.SELL,
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
                side: this.alpaca.sideType.BUY,
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
                side: this.alpaca.sideType.SELL,
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