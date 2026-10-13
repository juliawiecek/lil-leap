"""Shared-source LCOV remains resolvable and cannot escape the allowed roots."""
import tempfile
import unittest
from pathlib import Path
from prepare_sonar_coverage import normalize_lcov


class LcovPathTests(unittest.TestCase):
    def test_shared_paths_and_service_paths_are_normalized_idempotently(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ('frontend/src/app.ts', 'frontend-shared/auth-api.ts'):
                file = root / name
                file.parent.mkdir(parents=True, exist_ok=True)
                file.touch()
            for source in ('../frontend-shared/auth-api.ts', 'frontend-shared/auth-api.ts',
                           str(root / 'frontend-shared/auth-api.ts')):
                normalized = normalize_lcov(f'SF:{source}\n', 'frontend', root)
                self.assertEqual(normalized, 'SF:frontend-shared/auth-api.ts\n')
                self.assertEqual(normalize_lcov(normalized, 'frontend', root), normalized)
            self.assertEqual(normalize_lcov('SF:/app/src/app.ts\n', 'frontend', root),
                             'SF:frontend/src/app.ts\n')

    def test_paths_outside_service_and_shared_source_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'secret.ts').touch()
            for source in ('../secret.ts', str(root / 'secret.ts'), '../../outside.ts'):
                with self.assertRaises(ValueError):
                    normalize_lcov(f'SF:{source}\n', 'frontend', root)
