const Alpaca = require('@alpacahq/alpaca-trade-api')

const MINUTE = 60000

class AlpacaService {
  constructor({ keyId, secretKey, paper = true }) {
    this.instance = new Alpaca({
      keyId: keyId,
      secretKey: secretKey,
      paper: paper,
    })

    this.timeToClose = null
  }

  async awaitMarketOpen() {
    return new Promise(resolve => {
      const check = async () => {
        try {
          const clock = await this.instance.getClock()
          if (clock.is_open) {
            resolve()
          } else {
            const openTime = await this.getOpenTime()
            const currTime = await this.getCurrentTime()
            this.timeToClose = Math.floor((openTime - currTime) / 1000 / 60)
            console.log(
              `${this.numberToHourMinutes(
                this.timeToClose,
              )} til next market open.`,
            )
            setTimeout(check, MINUTE)
          }
        } catch (err) {
          console.error(err.error)
        }
      }
      check()
    })
  }

  async getOpenTime() {
    const clock = await this.instance.getClock()
    return new Date(
      clock.next_open.substring(0, clock.next_close.length - 6),
    ).getTime()
  }

  async getClosingTime() {
    const clock = await this.instance.getClock()
    return new Date(
      clock.next_close.substring(0, clock.next_close.length - 6),
    ).getTime()
  }

  async getCurrentTime() {
    const clock = await this.instance.getClock()
    return new Date(
      clock.timestamp.substring(0, clock.timestamp.length - 6),
    ).getTime()
  }

  async getTimeToClose() {
    const closingTime = await this.getClosingTime()
    const currentTime = await this.getCurrentTime()
    return Math.abs(closingTime - currentTime)
  }

  numberToHourMinutes(number) {
    const hours = number / 60
    const realHours = Math.floor(hours)
    const minutes = (hours - realHours) * 60
    const realMinutes = Math.round(minutes)
    return realHours + ' hour(s) and ' + realMinutes + ' minute(s)'
  }

  async cancelExistingOrders() {
    let orders
    try {
      orders = await this.instance.getOrders({
        status: 'open',
        direction: 'desc',
      })
    } catch (err) {
      console.error(err.error)
    }

    console.log('Canceling existing orders...')
    return Promise.all(
      orders.map(order => {
        return new Promise(async resolve => {
          try {
            await this.instance.cancelOrder(order.id)
          } catch (err) {
            console.error(err.error)
          }
          resolve()
        })
      }),
    )
  }

  async submitOrder({ quantity, stock, side }) {
    return new Promise(async resolve => {
      if (quantity <= 0) {
        console.log(
          `Quantity is <=0, order  of | ${quantity} ${stock} ${side} | not sent.`,
        )
        resolve(true)
        return
      }

      try {
        await this.instance.createOrder({
          symbol: stock,
          qty: quantity,
          side,
          type: 'market',
          time_in_force: 'day',
        })
        console.log(
          `Market order of | ${quantity} ${stock} ${side} | completed.`,
        )
        resolve(true)
      } catch (err) {
        console.log(
          `Order of | ${quantity} ${stock} ${side} | did not go through.`,
        )
        resolve(false)
      }
    })
  }

  async submitLimitOrder({
    quantity,
    stock,
    price,
    side,
  }) {
    return new Promise(async resolve => {
      if (quantity <= 0) {
        console.log(
          `Quantity is <=0, order of | ${quantity} ${stock} ${side} | not sent.`,
        )
        resolve(true)
        return
      }

      try {
        const lastOrder = await this.instance.createOrder({
          symbol: stock,
          qty: quantity,
          side: side,
          type: 'limit',
          time_in_force: 'day',
          limit_price: price,
        })
        console.log(
          'Limit order of |' + quantity + ' ' + stock + ' ' + side + '| sent.',
        )

        resolve(lastOrder)
      } catch (err) {
        console.error(
          'Order of |' +
            quantity +
            ' ' +
            stock +
            ' ' +
            side +
            '| did not go through.',
        )
        resolve(undefined)
      }
    })
  }
}

module.exports = { AlpacaService }