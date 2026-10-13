"""Coverage paths must resolve for independent apps and the shared package."""
from pathlib import Path
import tempfile
import unittest
import xml.etree.ElementTree as ET
from prepare_sonar_coverage import normalize_lcov, normalize_jacoco


class CoveragePathsTests(unittest.TestCase):
    def test_java_package_paths_are_unique_without_changing_coverage(self):
        original = ET.fromstring('<report name="service"><package name="com/example"><sourcefile name="SecurityConfig.java"><line nr="10" mi="0" ci="3" mb="1" cb="2" /></sourcefile></package></report>')
        for service in ('nextTrade-orders', 'nextTrade-holdings', 'insights'):
            qualified = normalize_jacoco(original, service)
            self.assertEqual(qualified.find('package').get('name'), service + '/src/main/java/com/example')
            self.assertEqual(qualified.find('.//line').attrib, original.find('.//line').attrib)
            self.assertEqual(ET.tostring(normalize_jacoco(qualified, service)), ET.tostring(qualified))
        self.assertEqual(original.find('package').get('name'), 'com/example')

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
