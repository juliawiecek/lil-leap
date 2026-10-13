"""Coverage paths must resolve for independent apps and the shared package."""
from pathlib import Path
import tempfile
import unittest
from prepare_sonar_coverage import normalize_lcov


class CoveragePathsTests(unittest.TestCase):
    def test_service_and_shared_windows_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for service in ('frontend', 'insights-frontend', 'shared/session-core'):
                source = root / service / 'src/session.ts'
                source.parent.mkdir(parents=True, exist_ok=True)
                source.write_text('export const active = true;')
                expected = f'SF:{service}/src/session.ts\nDA:1,1\n'
                self.assertEqual(normalize_lcov('SF:src\\session.ts\nDA:1,1\n', service, root), expected)
                self.assertEqual(normalize_lcov('SF:/app/src/session.ts\nDA:1,1\n', service, root), expected)
                self.assertEqual(normalize_lcov(expected, service, root), expected)

    def test_rejects_missing_and_outside_sources(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for source in ('src/missing.ts', '../outside.ts'):
                with self.assertRaisesRegex(ValueError, 'Unresolvable LCOV'):
                    normalize_lcov('SF:' + source, 'shared/session-core', root)


if __name__ == '__main__':
    unittest.main()
