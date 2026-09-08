
Administrator@EC2AMAZ-64EBKCO MINGW64 ~
$ curl http://localhost:8081/health
{"status":"UP"}

Administrator@EC2AMAZ-64EBKCO MINGW64 ~
$ curl http://localhost:8080/api/v1/quotes/AAPL
<html><head><meta http-equiv='refresh' content='1;url=/login?from=%2Fapi%2Fv1%2Fquotes%2FAAPL'/><script id='redirect' data-redirect-url='/login?from=%2Fapi%2Fv1%2Fquotes%2FAAPL' src='/static/f4b62345/scripts/redirect.js'></script></head><body style='background-color:white; color:white;'>
Authentication required
<!--
-->

</body></html>                                                                                                                                                  

Administrator@EC2AMAZ-64EBKCO MINGW64 ~
$ curl http://localhost:8081/api/v1/quotes/AAPL
{"ask":224.9521,"bid":224.8621,"cache_age_ms":0.0,"cache_ttl_ms":5000.0,"cached":false,"currency":"USD","price":224.9071,"quote_timestamp":"2026-09-08T22:37:37Z","source":"SYNTHETIC_GBM","symbol":"AAPL","synthetic":true}

Administrator@EC2AMAZ-64EBKCO MINGW64 ~
$ curl http://localhost:8081/api/v1/quotes/AAPL
{"ask":224.9379,"bid":224.8479,"cache_age_ms":0.0,"cache_ttl_ms":5000.0,"cached":false,"currency":"USD","price":224.8929,"quote_timestamp":"2026-09-08T22:37:51Z","source":"SYNTHETIC_GBM","symbol":"AAPL","synthetic":true}

Administrator@EC2AMAZ-64EBKCO MINGW64 ~
$ curl http://localhost:8081/api/v1/quotes/AAPL
{"ask":224.9291,"bid":224.8391,"cache_age_ms":0.0,"cache_ttl_ms":5000.0,"cached":false,"currency":"USD","price":224.8841,"quote_timestamp":"2026-09-08T22:37:57Z","source":"SYNTHETIC_GBM","symbol":"AAPL","synthetic":true}

Administrator@EC2AMAZ-64EBKCO MINGW64 ~
$ curl http://localhost:8081/api/v1/quotes/AAPL
{"ask":225.5238,"bid":225.4336,"cache_age_ms":0.0,"cache_ttl_ms":5000.0,"cached":false,"currency":"USD","price":225.4787,"quote_timestamp":"2026-09-08T22:38:52Z","source":"SYNTHETIC_GBM","symbol":"AAPL","synthetic":true}

Administrator@EC2AMAZ-64EBKCO MINGW64 ~
$ curl http://localhost:8081/api/v1/quotes/AAPL
{"ask":225.5238,"bid":225.4336,"cache_age_ms":1581.153,"cache_ttl_ms":5000.0,"cached":true,"currency":"USD","price":225.4787,"quote_timestamp":"2026-09-08T22:38:52Z","source":"SYNTHETIC_GBM","symbol":"AAPL","synthetic":true}

Administrator@EC2AMAZ-64EBKCO MINGW64 ~
$ curl http://localhost:8081/api/v1/quotes/GOOG
{"code":"QUOTE_NOT_FOUND","message":"No quote is available for symbol GOOG","symbol":"GOOG"}

Administrator@EC2AMAZ-64EBKCO MINGW64 ~
$ curl http://localhost:8081/api/v1/quotes/MSFT
{"ask":507.5678,"bid":507.3648,"cache_age_ms":0.0,"cache_ttl_ms":5000.0,"cached":false,"currency":"USD","price":507.4663,"quote_timestamp":"2026-09-08T22:39:51Z","source":"SYNTHETIC_GBM","symbol":"MSFT","synthetic":true}

Administrator@EC2AMAZ-64EBKCO MINGW64 ~
$ curl http://localhost:8081/api/v1/quotes/MSFT
{"ask":507.5678,"bid":507.3648,"cache_age_ms":3238.424,"cache_ttl_ms":5000.0,"cached":true,"currency":"USD","price":507.4663,"quote_timestamp":"2026-09-08T22:39:51Z","source":"SYNTHETIC_GBM","symbol":"MSFT","synthetic":true}

Administrator@EC2AMAZ-64EBKCO MINGW64 ~
$
