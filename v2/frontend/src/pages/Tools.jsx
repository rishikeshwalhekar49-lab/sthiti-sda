// Tools page: the original header and index, then the ten tools, each its own component.
import ScreenerTool from '../tools/ScreenerTool.jsx';
import ChartTool from '../tools/ChartTool.jsx';
import MoodTool from '../tools/MoodTool.jsx';
import PositionTool from '../tools/PositionTool.jsx';
import OptionsTool from '../tools/OptionsTool.jsx';
import ScannerTool from '../tools/ScannerTool.jsx';
import TopoTool from '../tools/TopoTool.jsx';
import BacktestTool from '../tools/BacktestTool.jsx';
import PortfolioTool from '../tools/PortfolioTool.jsx';
import PaperTool from '../tools/PaperTool.jsx';

export default function Tools() {
  return (
    // markup: public/index.html page:tools (filled by v2/tools/fill_markup.py)
    <>
      <section className="wrap phead">
        <div className="eyebrow mono-label">
          <span>Tools</span>
          <span id="toolsSrc" className="src live">NSE &amp; BSE data</span>
        </div>
        <h1>Every tool starts from a lesson and ends on a number</h1>
        <p className="intro">Each tool below reads real market data through this machine: live index levels, breadth, FII/DII flows and the NIFTY option chain from NSE, live quotes and fundamentals from BSE, and NSE's official end-of-day files for price history.</p>
        <nav className="index" aria-label="Tools">
          <a href="#tools/t-screen">Screener &amp; scorecard</a>
          <a href="#tools/t-chart">Chart &amp; quiz</a>
          <a href="#tools/t-mood">Mood meter</a>
          <a href="#tools/t-position">Position calculator</a>
          <a href="#tools/t-options">Option simulator</a>
          <a href="#tools/t-scanner">Scanner</a>
          <a href="#tools/t-topo">Topo-Screen</a>
          <a href="#tools/t-backtest">Regime backtester</a>
          <a href="#tools/t-portfolio">Portfolio fragility</a>
          <a href="#tools/t-paper">Paper trading</a>
        </nav>
      </section>
      <div className="wrap">
        <ScreenerTool />
        <ChartTool />
        <MoodTool />
        <PositionTool />
        <OptionsTool />
        <ScannerTool />
        <TopoTool />
        <BacktestTool />
        <PortfolioTool />
        <PaperTool />
      </div>
    </>
  );
}
