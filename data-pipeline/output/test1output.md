
Administrator@EC2AMAZ-64EBKCO MINGW64 ~
$ cd lil-leap/

Administrator@EC2AMAZ-64EBKCO MINGW64 ~/lil-leap (feature/data-pipeline)
$ ls
Dockerfile     Jenkinsfile  backend/        docker-compose.yml  src/
InitialSetup/  README.md    data-pipeline/  pom.xml             target/

Administrator@EC2AMAZ-64EBKCO MINGW64 ~/lil-leap (feature/data-pipeline)
$ git status
On branch feature/data-pipeline
Your branch is up to date with 'origin/feature/data-pipeline'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
        modified:   data-pipeline/.gitignore
        modified:   data-pipeline/requirements.txt
        modified:   data-pipeline/src/generate_quotes.py
        modified:   target/classes/com/neueda/leap/Main.class
        modified:   target/classes/com/neueda/leap/Order.class
        modified:   target/classes/com/neueda/leap/OrderValidationService.class

Untracked files:
  (use "git add <file>..." to include in what will be committed)
        backend/
        data-pipeline/.dockerignore
        data-pipeline/Dockerfile
        data-pipeline/RUN_ME.txt
        data-pipeline/src/app.py
        data-pipeline/src/quote_provider.py
        data-pipeline/tests/test_quote_api.py

no changes added to commit (use "git add" and/or "git commit -a")

Administrator@EC2AMAZ-64EBKCO MINGW64 ~/lil-leap (feature/data-pipeline)
$ ls src/
main/

Administrator@EC2AMAZ-64EBKCO MINGW64 ~/lil-leap (feature/data-pipeline)
$ ls
Dockerfile     Jenkinsfile  backend/        docker-compose.yml  src/
InitialSetup/  README.md    data-pipeline/  pom.xml             target/

Administrator@EC2AMAZ-64EBKCO MINGW64 ~/lil-leap (feature/data-pipeline)
$ ls -la
total 61
drwxr-xr-x 1 Administrator 197121    0 Sep  7 19:16 ./
drwxr-xr-x 1 Administrator 197121    0 Sep  8 14:04 ../
drwxr-xr-x 1 Administrator 197121    0 Sep  8 22:29 .git/
drwxr-xr-x 1 Administrator 197121    0 Aug 24 18:56 .idea/
-rw-r--r-- 1 Administrator 197121 1852 Sep  7 19:14 Dockerfile
drwxr-xr-x 1 Administrator 197121    0 Aug 24 18:56 InitialSetup/
-rw-r--r-- 1 Administrator 197121 1539 Sep  7 19:14 Jenkinsfile
-rw-r--r-- 1 Administrator 197121  468 Aug 24 18:56 README.md
drwxr-xr-x 1 Administrator 197121    0 Sep  7 19:14 backend/
drwxr-xr-x 1 Administrator 197121    0 Sep  8 22:19 data-pipeline/
-rw-r--r-- 1 Administrator 197121 1240 Sep  7 19:14 docker-compose.yml
-rw-r--r-- 1 Administrator 197121 1388 Sep  7 19:14 pom.xml
drwxr-xr-x 1 Administrator 197121    0 Sep  7 19:14 src/
drwxr-xr-x 1 Administrator 197121    0 Sep  7 19:14 target/

Administrator@EC2AMAZ-64EBKCO MINGW64 ~/lil-leap (feature/data-pipeline)
$ ls data-pipeline/
Dockerfile  README.md  RUN_ME.txt  output/  requirements.txt  src/  tests/

Administrator@EC2AMAZ-64EBKCO MINGW64 ~/lil-leap (feature/data-pipeline)
$ cd data-pipeline/

Administrator@EC2AMAZ-64EBKCO MINGW64 ~/lil-leap/data-pipeline (feature/data-pipeline)
$ source .venv/Scripts/activate
(.venv)
Administrator@EC2AMAZ-64EBKCO MINGW64 ~/lil-leap/data-pipeline (feature/data-pipeline)
$ python -m pip install -r requirements.txt
Requirement already satisfied: numpy in .\.venv\Lib\site-packages (from -r requirements.txt (line 1)) (2.5.3)
Requirement already satisfied: pandas in .\.venv\Lib\site-packages (from -r requirements.txt (line 2)) (3.0.5)
Requirement already satisfied: pytest in .\.venv\Lib\site-packages (from -r requirements.txt (line 3)) (9.1.1)
Collecting flask (from -r requirements.txt (line 4))
  Downloading flask-3.1.3-py3-none-any.whl.metadata (3.2 kB)
Requirement already satisfied: python-dateutil>=2.8.2 in .\.venv\Lib\site-packages (from pandas->-r requirements.txt (line 2)) (2.9.0.post0)
Requirement already satisfied: tzdata in .\.venv\Lib\site-packages (from pandas->-r requirements.txt (line 2)) (2026.3)
Requirement already satisfied: colorama>=0.4 in .\.venv\Lib\site-packages (from pytest->-r requirements.txt (line 3)) (0.4.6)
Requirement already satisfied: iniconfig>=1.0.1 in .\.venv\Lib\site-packages (from pytest->-r requirements.txt (line 3)) (2.3.0)
Requirement already satisfied: packaging>=22 in .\.venv\Lib\site-packages (from pytest->-r requirements.txt (line 3)) (26.3)
Requirement already satisfied: pluggy<2,>=1.5 in .\.venv\Lib\site-packages (from pytest->-r requirements.txt (line 3)) (1.6.0)
Requirement already satisfied: pygments>=2.7.2 in .\.venv\Lib\site-packages (from pytest->-r requirements.txt (line 3)) (2.21.0)
Collecting blinker>=1.9.0 (from flask->-r requirements.txt (line 4))
  Downloading blinker-1.9.0-py3-none-any.whl.metadata (1.6 kB)
Collecting click>=8.1.3 (from flask->-r requirements.txt (line 4))
  Downloading click-8.5.0-py3-none-any.whl.metadata (2.6 kB)
Collecting itsdangerous>=2.2.0 (from flask->-r requirements.txt (line 4))
  Downloading itsdangerous-2.2.0-py3-none-any.whl.metadata (1.9 kB)
Collecting jinja2>=3.1.2 (from flask->-r requirements.txt (line 4))
  Using cached jinja2-3.1.6-py3-none-any.whl.metadata (2.9 kB)
Collecting markupsafe>=2.1.1 (from flask->-r requirements.txt (line 4))
  Using cached markupsafe-3.0.3-cp314-cp314-win_amd64.whl.metadata (2.8 kB)
Collecting werkzeug>=3.1.0 (from flask->-r requirements.txt (line 4))
  Downloading werkzeug-3.1.8-py3-none-any.whl.metadata (4.0 kB)
Requirement already satisfied: six>=1.5 in .\.venv\Lib\site-packages (from python-dateutil>=2.8.2->pandas->-r requirements.txt (line 2)) (1.17.0)
Downloading flask-3.1.3-py3-none-any.whl (103 kB)
Downloading blinker-1.9.0-py3-none-any.whl (8.5 kB)
Downloading click-8.5.0-py3-none-any.whl (125 kB)
Downloading itsdangerous-2.2.0-py3-none-any.whl (16 kB)
Using cached jinja2-3.1.6-py3-none-any.whl (134 kB)
Using cached markupsafe-3.0.3-cp314-cp314-win_amd64.whl (15 kB)
Downloading werkzeug-3.1.8-py3-none-any.whl (226 kB)
Installing collected packages: markupsafe, itsdangerous, click, blinker, werkzeug, jinja2, flask
Successfully installed blinker-1.9.0 click-8.5.0 flask-3.1.3 itsdangerous-2.2.0 jinja2-3.1.6 markupsafe-3.0.3 werkzeug-3.1.8
(.venv)
Administrator@EC2AMAZ-64EBKCO MINGW64 ~/lil-leap/data-pipeline (feature/data-pipeline)
$ python -m pytest -v
============================= test session starts =============================
platform win32 -- Python 3.14.0, pytest-9.1.1, pluggy-1.6.0 -- C:\Users\Administrator\lil-leap\data-pipeline\.venv\Scripts\python.exe
cachedir: .pytest_cache
rootdir: C:\Users\Administrator\lil-leap\data-pipeline
collected 18 items

tests/test_generate_quotes.py::test_expected_row_count PASSED            [  5%]
tests/test_generate_quotes.py::test_required_columns_exist PASSED        [ 11%]
tests/test_generate_quotes.py::test_prices_are_positive_and_ordered PASSED [ 16%]
tests/test_generate_quotes.py::test_quotes_use_required_labels PASSED    [ 22%]
tests/test_generate_quotes.py::test_symbol_timestamp_pairs_are_unique PASSED [ 27%]
tests/test_generate_quotes.py::test_same_seed_produces_same_quotes PASSED [ 33%]
tests/test_generate_quotes.py::test_different_seed_changes_prices PASSED [ 38%]
tests/test_generate_quotes.py::test_timestamps_are_chronological PASSED  [ 44%]
tests/test_generate_quotes.py::test_validation_rejects_duplicate_quote PASSED [ 50%]
tests/test_generate_quotes.py::test_invalid_start_price_is_rejected PASSED [ 55%]
tests/test_quote_api.py::test_supported_symbol_returns_quote PASSED      [ 61%]
tests/test_quote_api.py::test_symbol_lookup_is_case_insensitive PASSED   [ 66%]
tests/test_quote_api.py::test_unsupported_symbol_returns_controlled_404 PASSED [ 72%]
tests/test_quote_api.py::test_second_request_reuses_cached_quote PASSED  [ 77%]
tests/test_quote_api.py::test_expired_cache_fetches_provider_again PASSED [ 83%]
tests/test_quote_api.py::test_cache_entries_are_isolated_by_symbol PASSED [ 88%]
tests/test_quote_api.py::test_source_failure_returns_503 PASSED          [ 94%]
tests/test_quote_api.py::test_health_endpoint PASSED                     [100%]

============================= 18 passed in 0.92s ==============================
(.venv)
Administrator@EC2AMAZ-64EBKCO MINGW64 ~/lil-leap/data-pipeline (feature/data-pipeline)
$ python -m src.app
 * Serving Flask app 'app'
 * Debug mode: off
An attempt was made to access a socket in a way forbidden by its access permissions
(.venv)
Administrator@EC2AMAZ-64EBKCO MINGW64 ~/lil-leap/data-pipeline (feature/data-pipeline)
$ export PORT=8081
(.venv)
Administrator@EC2AMAZ-64EBKCO MINGW64 ~/lil-leap/data-pipeline (feature/data-pipeline)
$ python -m src.app
 * Serving Flask app 'app'
 * Debug mode: off
WARNING: This is a development server. Do not use it in a production deployment. Use a production WSGI server instead.
 * Running on all addresses (0.0.0.0)
 * Running on http://127.0.0.1:8081
 * Running on http://10.14.140.0:8081
Press CTRL+C to quit
127.0.0.1 - - [08/Sep/2026 22:36:56] "GET /health HTTP/1.1" 200 -
127.0.0.1 - - [08/Sep/2026 22:37:37] "GET /api/v1/quotes/AAPL HTTP/1.1" 200 -
127.0.0.1 - - [08/Sep/2026 22:37:51] "GET /api/v1/quotes/AAPL HTTP/1.1" 200 -
127.0.0.1 - - [08/Sep/2026 22:37:57] "GET /api/v1/quotes/AAPL HTTP/1.1" 200 -
127.0.0.1 - - [08/Sep/2026 22:38:52] "GET /api/v1/quotes/AAPL HTTP/1.1" 200 -
127.0.0.1 - - [08/Sep/2026 22:38:53] "GET /api/v1/quotes/AAPL HTTP/1.1" 200 -
127.0.0.1 - - [08/Sep/2026 22:39:19] "GET /api/v1/quotes/GOOG HTTP/1.1" 404 -
127.0.0.1 - - [08/Sep/2026 22:39:51] "GET /api/v1/quotes/MSFT HTTP/1.1" 200 -
127.0.0.1 - - [08/Sep/2026 22:39:55] "GET /api/v1/quotes/MSFT HTTP/1.1" 200 -
(.venv)
Administrator@EC2AMAZ-64EBKCO MINGW64 ~/lil-leap/data-pipeline (feature/data-pipeline)
$
