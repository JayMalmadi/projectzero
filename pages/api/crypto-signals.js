// pages/api/crypto-signals.js
// Crypto signals - EMA Momentum, RSI Reversal, Bollinger Breakout, MACD Cross

export default async function handler(req, res) {
  const { symbol = 'BTC', strategy = 'momentum' } = req.query
  try {
    const SYMS = {BTC:'BTCUSDT',ETH:'ETHUSDT',SOL:'SOLUSDT',BNB:'BNBUSDT',XRP:'XRPUSDT',DOGE:'DOGEUSDT',ADA:'ADAUSDT'}
    const binSym = SYMS[symbol] || `${symbol}USDT`

    const r = await fetch(`https://api.binance.us/api/v3/klines?symbol=${binSym}&interval=15m&limit=200`)
    const klines = await r.json()
    if (!Array.isArray(klines) || klines.length < 50)
      return res.status(500).json({error:'Not enough data',signal:'HOLD',confidence:0})

    const closes  = klines.map(k=>parseFloat(k[4]))
    const highs   = klines.map(k=>parseFloat(k[2]))
    const lows    = klines.map(k=>parseFloat(k[3]))
    const volumes = klines.map(k=>parseFloat(k[5]))
    const price   = closes[closes.length-1]

    // EMA
    function ema(data,p){const k=2/(p+1);let v=data.slice(0,p).reduce((a,b)=>a+b,0)/p;for(let i=p;i<data.length;i++)v=data[i]*k+v*(1-k);return v}
    function emaArr(data,p){const k=2/(p+1),out=new Array(data.length).fill(0);out[p-1]=data.slice(0,p).reduce((a,b)=>a+b,0)/p;for(let i=p;i<data.length;i++)out[i]=data[i]*k+out[i-1]*(1-k);return out}

    // RSI
    function rsi(data,p=14){let g=0,l=0;for(let i=data.length-p-1;i<data.length-1;i++){const d=data[i+1]-data[i];if(d>0)g+=d;else l-=d}const ag=g/p,al=l/p||0.0001;return 100-(100/(1+ag/al))}

    // Bollinger
    function bb(data,p=20,m=2){const sl=data.slice(-p),mn=sl.reduce((a,b)=>a+b,0)/p,std=Math.sqrt(sl.reduce((a,b)=>a+(b-mn)**2,0)/p);return{upper:mn+m*std,middle:mn,lower:mn-m*std,std,mean:mn}}

    // MACD
    function macd(data){const e12=emaArr(data,12),e26=emaArr(data,26),ml=e12.map((v,i)=>v-e26[i]).slice(26),s9=emaArr(ml,9),n=ml.length-1;return{macd:ml[n],signal:s9[n],hist:ml[n]-s9[n],prevHist:ml[n-1]-s9[n-2],crossUp:ml[n]>s9[n]&&ml[n-1]<s9[n-2],crossDown:ml[n]<s9[n]&&ml[n-1]>s9[n-2]}}

    // ATR
    function atr(h,l,c,p=14){const trs=[];for(let i=1;i<c.length;i++)trs.push(Math.max(h[i]-l[i],Math.abs(h[i]-c[i-1]),Math.abs(l[i]-c[i-1])));return trs.slice(-p).reduce((a,b)=>a+b,0)/p}

    const volAvg   = volumes.slice(-21,-1).reduce((a,b)=>a+b,0)/20
    const volRatio = volumes[volumes.length-1]/(volAvg||1)
    const rsiVal   = rsi(closes)
    const ema9v    = ema(closes,9), ema21v=ema(closes,21), ema50v=ema(closes,50)
    const ema200v  = closes.length>=200?ema(closes,200):ema(closes,100)
    const bbVal    = bb(closes)
    const macdVal  = macd(closes)
    const atrVal   = atr(highs,lows,closes)

    let signal='HOLD',confidence=0,reason='',stopLoss=null,target=null

    if (strategy==='momentum') {
      let bull=0,bear=0,flags=[]
      if(ema9v>ema21v){bull+=2;flags.push('EMA9>21')}else{bear+=2;flags.push('EMA9<21')}
      if(ema21v>ema50v){bull+=2;flags.push('EMA21>50')}else{bear+=2;flags.push('EMA21<50')}
      if(price>ema200v){bull+=1;flags.push('Above EMA200')}else{bear+=1;flags.push('Below EMA200')}
      if(rsiVal>52&&rsiVal<72){bull+=2;flags.push(`RSI ${rsiVal.toFixed(0)}`)}
      else if(rsiVal<48&&rsiVal>28){bear+=2;flags.push(`RSI ${rsiVal.toFixed(0)}`)}
      if(volRatio>1.2){bull+=1;bear+=1;flags.push(`Vol ${volRatio.toFixed(1)}x`)}
      if(macdVal.crossUp){bull+=3;flags.push('MACD cross up')}
      if(macdVal.crossDown){bear+=3;flags.push('MACD cross down')}
      if(macdVal.hist>0)bull+=1;else bear+=1
      const tot=bull+bear
      if(bull>=6&&bull>bear){
        signal='BUY';confidence=Math.min(88,Math.round(52+(bull/tot)*36))
        stopLoss=parseFloat((price-atrVal*2).toFixed(2));target=parseFloat((price+atrVal*3).toFixed(2))
        reason=`Bullish: ${flags.slice(0,4).join(', ')}. SL=ATR×2, Target=ATR×3. R:R ~1:1.5`
      } else if(bear>=6&&bear>bull){
        signal='SELL';confidence=Math.min(86,Math.round(50+(bear/tot)*36))
        stopLoss=parseFloat((price+atrVal*2).toFixed(2));target=parseFloat((price-atrVal*3).toFixed(2))
        reason=`Bearish: ${flags.slice(0,4).join(', ')}. SL=ATR×2, Target=ATR×3. R:R ~1:1.5`
      } else {
        confidence=Math.min(45,Math.round(20+Math.abs(bull-bear)*4))
        reason=`Mixed — Bull ${bull} vs Bear ${bear}. ${flags.slice(0,3).join(', ')}. No clear edge. Wait.`
      }
    }

    else if(strategy==='rsi-reversal') {
      const prevClose=closes[closes.length-2]
      if(rsiVal<35&&price<=bbVal.lower*1.002){
        signal='BUY';confidence=Math.min(88,Math.round(60+(35-rsiVal)*1.5))
        stopLoss=parseFloat((bbVal.lower-atrVal).toFixed(2));target=parseFloat((bbVal.middle+(bbVal.middle-bbVal.lower)*0.6).toFixed(2))
        reason=`RSI ${rsiVal.toFixed(0)} oversold + Price at lower Bollinger Band. High-probability bounce setup.`
      } else if(rsiVal>65&&price>=bbVal.upper*0.998){
        signal='SELL';confidence=Math.min(86,Math.round(58+(rsiVal-65)*1.5))
        stopLoss=parseFloat((bbVal.upper+atrVal).toFixed(2));target=parseFloat((bbVal.middle-(bbVal.upper-bbVal.middle)*0.6).toFixed(2))
        reason=`RSI ${rsiVal.toFixed(0)} overbought + Price at upper Bollinger Band. Mean reversion to BB midline.`
      } else if(rsiVal<38){
        signal='BUY';confidence=Math.min(65,Math.round(45+(38-rsiVal)*2))
        stopLoss=parseFloat((price-atrVal*1.5).toFixed(2));target=parseFloat((price+atrVal*2.2).toFixed(2))
        reason=`RSI ${rsiVal.toFixed(0)} approaching oversold. Not at BB lower yet — moderate setup.`
      } else if(rsiVal>62){
        signal='SELL';confidence=Math.min(63,Math.round(43+(rsiVal-62)*2))
        stopLoss=parseFloat((price+atrVal*1.5).toFixed(2));target=parseFloat((price-atrVal*2.2).toFixed(2))
        reason=`RSI ${rsiVal.toFixed(0)} approaching overbought. Not at BB upper yet — moderate setup.`
      } else {
        confidence=Math.round(15+Math.abs(50-rsiVal))
        reason=`RSI ${rsiVal.toFixed(0)} — neutral zone. Wait for RSI < 35 (buy) or > 65 (sell) for reversal entry.`
      }
    }

    else if(strategy==='bb-breakout') {
      const prevClose=closes[closes.length-2]
      const bandWidth=(bbVal.upper-bbVal.lower)/bbVal.middle
      const squeeze=bbVal.std<(bbVal.mean*0.008)
      const breakUp=price>bbVal.upper&&prevClose<=bbVal.upper
      const breakDown=price<bbVal.lower&&prevClose>=bbVal.lower
      if(breakUp&&volRatio>1.15){
        signal='BUY';confidence=Math.min(84,Math.round(60+volRatio*8))
        stopLoss=parseFloat(bbVal.middle.toFixed(2));target=parseFloat((bbVal.upper+(bbVal.upper-bbVal.middle)).toFixed(2))
        reason=`Bollinger Band breakout UP with ${volRatio.toFixed(1)}x volume. Target = 1x band width above upper band.`
      } else if(breakDown&&volRatio>1.15){
        signal='SELL';confidence=Math.min(82,Math.round(58+volRatio*8))
        stopLoss=parseFloat(bbVal.middle.toFixed(2));target=parseFloat((bbVal.lower-(bbVal.middle-bbVal.lower)).toFixed(2))
        reason=`Bollinger Band breakdown with ${volRatio.toFixed(1)}x volume. Target = 1x band width below lower band.`
      } else if(squeeze){
        confidence=42;reason=`BB Squeeze — bands extremely tight (${(bandWidth*100).toFixed(1)}% width). Big move imminent. Wait for breakout direction.`
      } else {
        confidence=Math.round(18+bandWidth*80);reason=`Inside Bollinger Bands. Width: ${(bandWidth*100).toFixed(1)}%. Vol ${volRatio.toFixed(1)}x. Wait for breakout.`
      }
    }

    else if(strategy==='macd-cross') {
      const aboveTrend=price>ema50v
      if(macdVal.crossUp&&aboveTrend){
        signal='BUY';confidence=Math.min(85,Math.round(65+(volRatio>1.2?10:0)+(price>ema200v?8:0)))
        stopLoss=parseFloat((price-atrVal*1.8).toFixed(2));target=parseFloat((price+atrVal*2.8).toFixed(2))
        reason=`MACD bullish cross above signal line. Price above EMA50 trend.${volRatio>1.2?` Volume ${volRatio.toFixed(1)}x confirms.`:''} R:R ~1:1.5`
      } else if(macdVal.crossDown&&!aboveTrend){
        signal='SELL';confidence=Math.min(83,Math.round(62+(volRatio>1.2?10:0)))
        stopLoss=parseFloat((price+atrVal*1.8).toFixed(2));target=parseFloat((price-atrVal*2.8).toFixed(2))
        reason=`MACD bearish cross below signal line. Price below EMA50. Downtrend continuation.`
      } else if(macdVal.crossUp){
        signal='BUY';confidence=56
        stopLoss=parseFloat((price-atrVal*1.5).toFixed(2));target=parseFloat((price+atrVal*2.2).toFixed(2))
        reason=`MACD bullish cross but price below EMA50 — weaker setup. Smaller size recommended.`
      } else if(macdVal.hist>0&&macdVal.hist>macdVal.prevHist){
        confidence=38;reason=`MACD histogram positive and growing. Bullish momentum building. Wait for cross.`
      } else if(macdVal.hist<0&&macdVal.hist<macdVal.prevHist){
        confidence=35;reason=`MACD histogram negative and deepening. Bearish pressure. Wait for cross.`
      } else {
        confidence=20;reason=`MACD ${macdVal.macd>0?'positive':'negative'} (${macdVal.macd.toFixed(4)}). No recent cross. RSI ${rsiVal.toFixed(0)}.`
      }
    }

    const rr = stopLoss&&target ? parseFloat((Math.abs(target-price)/Math.abs(price-stopLoss)).toFixed(2)) : null
    const chartData = klines.slice(-60).map(k=>({date:new Date(parseInt(k[0])).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}),close:parseFloat(k[4]),volume:parseFloat(k[5])}))

    return res.status(200).json({
      status:'success', symbol, strategy, signal, confidence,
      price, stopLoss, target, reason, rr,
      indicators:{rsi:parseFloat(rsiVal.toFixed(1)),ema9:parseFloat(ema9v.toFixed(2)),ema21:parseFloat(ema21v.toFixed(2)),ema50:parseFloat(ema50v.toFixed(2)),ema200:parseFloat(ema200v.toFixed(2)),bbUpper:parseFloat(bbVal.upper.toFixed(2)),bbLower:parseFloat(bbVal.lower.toFixed(2)),macdHist:parseFloat(macdVal.hist.toFixed(4)),atr:parseFloat(atrVal.toFixed(2)),volRatio:parseFloat(volRatio.toFixed(2))},
      chartData, market:'crypto', exchange:'binance',
    })
  } catch(err) {
    return res.status(500).json({error:err.message,signal:'HOLD',confidence:0})
  }
}
