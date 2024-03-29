const { AlpacaService } = require('../../Alpaca/AlpacaService')

const MINUTE = 60000
const TWENTY_MINUTES = 20

class MeanReversionService {
  constructor( keyId, secretKey, paper = true, symbols) {
    this.alpaca = new AlpacaService({
      keyId: keyId,
      secretKey: secretKey,
      paper: paper,
    })

    this.timeToClose = null

    this.runningAverage = 0
    this.lastOrder = null
    this.stock = symbols
  }

  async run() {
    if (!this.stock) {
      return
    }
    await this.alpaca.cancelExistingOrders()

    console.log('Waiting for market to open...')
    await this.alpaca.awaitMarketOpen()
    console.log('Market opened.')

    console.log(`--- Trading stock ${this.stock} ---`)
    await this.getAvgPricesOnLastXMinutes(TWENTY_MINUTES)
  }

  async getAvgPricesOnLastXMinutes(minutes) {
    const promBars = new Promise((resolve, reject) => {
      const barChecker = setInterval(async () => {
        await this.alpaca.instance.getCalendar(Date.now()).then(async resp => {
          const marketOpen = resp[0].open
          await this.alpaca.instance
            .getBarsV2(
              stock.name,
              {
                start: marketOpen,
                timeframe: this.alpaca.instance.newTimeframe(
                  1,
                  this.alpaca.instance.timeframeUnit.MIN
                ),
              },
              this.alpaca.instance.configuration
            )
            .then(resp => {
              const bars = [];
              for await(let bar of resp) { bars.push(bar) };

              if (bars.length >= minutes) {
                clearInterval(barChecker)
                resolve()
              }
            })
            .catch(err => {
              console.error(err.error, 'promBars')
            })
        })
      }, MINUTE)
    })
    await promBars

    const spin = setInterval(async () => {
      if (this.lastOrder != null)
        await this.alpaca.instance.cancelOrder(this.lastOrder.id).catch(err => {
          console.error(err.error, 'CancelOrder')
        })

      const INTERVAL = 15 // minutes

      this.timeToClose = await this.alpaca.getTimeToClose()

      if (this.timeToClose < MINUTE * INTERVAL) {
        console.log('Market closing soon.  Closing positions.')
        try {
          await this.alpaca.instance
            .getPosition(this.stock)
            .then(async resp => {
              const positionQuantity = resp.qty
              await this.alpaca.submitOrder({
                quantity: positionQuantity,
                stock: this.stock,
                side: "sell",
              })
            })
            .catch(err => {
              console.error(err.error, 'Closing positions')
            })
        } catch (err) {
          console.log(err.error);
        }
        clearInterval(spin)
        console.log('Sleeping until market close (15 minutes).')
        setTimeout(() => {
          this.run()
        }, 60000 * 15)
      } else {
        await this.rebalance()
      }
    }, 60000)
  }

  async rebalance() {
    let positionQuantity = 0
    let positionValue = 0

    try {
      await this.alpaca.instance.getPosition(this.stock).then(resp => {
        positionQuantity = resp.qty
        positionValue = resp.market_value
      })
    } catch (err) {
      console.log(err.error);
    }

    let bars
    await this.alpaca.instance.getBarsV2(
        stock.name,
        {
          timeframe: this.alpaca.instance.newTimeframe(
            1,
            this.alpaca.instance.timeframeUnit.MIN
          ),
          limit: 20,
        },
        this.alpaca.instance.configuration
      )
      .then(resp => {
        for await (let bar of resp) { bars.push(bar) }
      })
      .catch(err => {
        console.log(err.error)
      })

    const currPrice =  this.alpaca.instance.configuration.usePolygon ? bars[bars.length - 1].c : bars[bars.length - 1].ClosePrice
    this.runningAverage = 0
    bars.forEach(bar => {
      const price = this.alpaca.instance.configuration.usePolygon ? bar.c : bar.ClosePrice
      this.runningAverage += price
    })
    this.runningAverage /= 20

    if (currPrice > this.runningAverage) {
      if (positionQuantity > 0) {
        console.log('Setting position to zero.')
        this.lastOrder = await this.alpaca.submitLimitOrder({
          quantity: positionQuantity,
          stock: this.stock,
          price: currPrice,
          side: "sell",
        })
      } else console.log('No position in the stock.  No action required.')
    } else if (currPrice < this.runningAverage) {
      let portfolioValue
      let buyingPower
      await this.alpaca.instance
        .getAccount()
        .then(resp => {
          portfolioValue = resp.portfolio_value
          buyingPower = resp.buying_power
        })
        .catch(err => {
          console.log(err.error)
        })
      const portfolioShare =
        ((this.runningAverage - currPrice) / currPrice) * 200
      const targetPositionValue = portfolioValue * portfolioShare
      let amountToAdd = targetPositionValue - positionValue

      if (amountToAdd > 0) {
        if (amountToAdd > buyingPower) amountToAdd = buyingPower
        const qtyToBuy = Math.floor(amountToAdd / currPrice)
        this.lastOrder = await this.alpaca.submitLimitOrder({
          quantity: qtyToBuy,
          stock: this.stock,
          price: currPrice,
          side: "buy",
        })
      } else {
        amountToAdd *= -1
        let qtyToSell = Math.floor(amountToAdd / currPrice)
        if (qtyToSell > positionQuantity) qtyToSell = positionQuantity
        this.lastOrder = await this.alpaca.submitLimitOrder({
          quantity: qtyToSell,
          stock: this.stock,
          price: currPrice,
          side: "sell",
        })
      }
    }
  }
}

module.exports = { MeanReversionService }