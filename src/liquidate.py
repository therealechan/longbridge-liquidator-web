#!/usr/bin/env python3
"""
长桥一键清仓脚本 - 支持 JSON 输出
"""
import os
import sys
import json
import argparse

# 模拟模式（用于演示）
MOCK_MODE = os.environ.get('MOCK_MODE', 'false').lower() == 'true'

def mock_positions():
    """模拟持仓数据"""
    return [
        {"symbol": "AAPL.US", "quantity": 100, "market_price": 185.50},
        {"symbol": "TSLA.US", "quantity": 50, "market_price": 242.30},
        {"symbol": "NVDA.US", "quantity": 25, "market_price": 875.20},
    ]

def get_positions_real(config):
    """获取真实持仓"""
    try:
        from longport.openapi import TradeContext
        ctx = TradeContext(config)
        positions = ctx.positions()
        return [
            {
                "symbol": p.symbol,
                "quantity": p.quantity,
                "market_price": float(p.market_price) if hasattr(p, 'market_price') else 0
            }
            for p in positions
        ]
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return []

def liquidate_real(config, symbols):
    """真实清仓"""
    from longport.openapi import TradeContext, OrderSide, OrderType, TimeInForce
    
    ctx = TradeContext(config)
    results = []
    
    for symbol in symbols:
        try:
            order = ctx.submit_order(
                symbol=symbol,
                order_type=OrderType.MO,
                side=OrderSide.Sell,
                quantity=0,  # 需要获取实际持仓数量
                time_in_force=TimeInForce.Day
            )
            results.append({"symbol": symbol, "success": True, "order_id": str(order.order_id)})
        except Exception as e:
            results.append({"symbol": symbol, "success": False, "error": str(e)})
    
    return results

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--json', action='store_true', help='JSON 输出')
    parser.add_argument('--execute', action='store_true', help='执行清仓')
    parser.add_argument('--symbols', type=str, help='股票代码，逗号分隔')
    args = parser.parse_args()

    # 获取配置
    app_key = os.environ.get('LONGBRIDGE_APP_KEY')
    app_secret = os.environ.get('LONGBRIDGE_APP_SECRET')
    access_token = os.environ.get('LONGBRIDGE_ACCESS_TOKEN', '')

    if not app_key or not app_secret:
        error = {"error": "Missing LONGBRIDGE_APP_KEY or LONGBRIDGE_APP_SECRET"}
        if args.json:
            print(f"JSON_OUTPUT:{json.dumps(error)}")
        else:
            print(error['error'])
        sys.exit(1)

    if MOCK_MODE:
        # 模拟模式
        positions = mock_positions()
        total_value = sum(p['quantity'] * p['market_price'] for p in positions)
        
        result = {
            "positions": positions,
            "totalValue": total_value
        }
        
        if args.json:
            print(f"JSON_OUTPUT:{json.dumps(result)}")
        else:
            print(json.dumps(result, indent=2))
        return

    # 真实模式
    try:
        from longport.openapi import Config
        config = Config(app_key, app_secret, access_token=access_token)
        
        if args.execute:
            # 执行清仓
            symbols = args.symbols.split(',') if args.symbols else []
            results = liquidate_real(config, symbols)
            result = {"success": True, "results": results}
        else:
            # 查询持仓
            positions = get_positions_real(config)
            total_value = sum(p['quantity'] * p['market_price'] for p in positions)
            result = {
                "positions": positions,
                "totalValue": total_value
            }
        
        if args.json:
            print(f"JSON_OUTPUT:{json.dumps(result)}")
        else:
            print(json.dumps(result, indent=2))
            
    except ImportError:
        error = {"error": "longport SDK not installed. Run: pip install longport"}
        if args.json:
            print(f"JSON_OUTPUT:{json.dumps(error)}")
        else:
            print(error['error'])
        sys.exit(1)
    except Exception as e:
        error = {"error": str(e)}
        if args.json:
            print(f"JSON_OUTPUT:{json.dumps(error)}")
        else:
            print(str(e))
        sys.exit(1)

if __name__ == '__main__':
    main()
