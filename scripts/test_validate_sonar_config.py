"""Regression checks for invalid scan configuration and profile drift."""

import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET

import validate_sonar_config as validator


PROFILE = '''<profile><name>python-profile</name><language>py</language><rules>
<rule><repositoryKey>python</repositoryKey><key>S1</key><priority>MAJOR</priority>
<parameters><parameter><key>max</key><value>3</value></parameter></parameters>
</rule></rules></profile>'''


class ValidationTests(unittest.TestCase):
    def test_ant_patterns(self):
        self.assertTrue(validator.matches('Test.java', ['**/*Test.java']))
        self.assertTrue(validator.matches('a/b/FooTest.java', ['**/*Test.java']))
        self.assertFalse(validator.matches('a/b/FooTest.java', ['a/*Test.java']))
        self.assertTrue(validator.matches('data-pipeline/tests/test_app.py', ['data-pipeline/tests/**/*.py']))

    def test_java_inputs_require_test_bytecode_and_dependency_jars(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            props = {
                'sonar.java.binaries': 'target/classes',
                'sonar.java.test.binaries': 'target/test-classes',
                'sonar.java.libraries': 'target/sonar-libraries/*.jar',
                'sonar.java.test.libraries': 'target/sonar-libraries/*.jar',
            }
            for path in ('target/classes/App.class', 'target/test-classes/AppTest.class',
                         'target/sonar-libraries/dependency.jar'):
                file = root / path
                file.parent.mkdir(parents=True, exist_ok=True)
                file.touch()
            validator.validate_java_inputs(root, props)
            (root / 'target/test-classes/AppTest.class').unlink()
            with self.assertRaisesRegex(ValueError, 'sonar.java.test.binaries'):
                validator.validate_java_inputs(root, props)
            (root / 'target/test-classes/AppTest.class').touch()
            (root / 'target/sonar-libraries/dependency.jar').unlink()
            with self.assertRaisesRegex(ValueError, 'No dependency JARs'):
                validator.validate_java_inputs(root, props)
            (root / 'target/sonar-libraries/dependency.jar').touch()
            props.pop('sonar.java.test.libraries')
            with self.assertRaisesRegex(ValueError, 'Missing required Java analysis property'):
                validator.validate_java_inputs(root, props)

    def test_rejects_placeholder_and_duplicate_rules(self):
        with self.assertRaises(ValueError):
            validator.profile_rules(ET.fromstring('<pending-quality-profile />'))
        profile = ET.fromstring(PROFILE)
        profile.find('rules').append(ET.fromstring(ET.tostring(profile.find('rules/rule'))))
        with self.assertRaisesRegex(ValueError, 'duplicate'):
            validator.profile_rules(profile)

    def test_detects_parameter_drift(self):
        self.assertNotEqual(validator.profile_rules(ET.fromstring(PROFILE)),
                            validator.profile_rules(ET.fromstring(PROFILE.replace('<value>3', '<value>4'))))

    def test_missing_language_and_missing_scan_path(self):
        with tempfile.TemporaryDirectory() as directory, contextlib.redirect_stdout(io.StringIO()):
            root = Path(directory)
            (root / 'src').mkdir()
            (root / 'src/app.ts').write_text('export const x = 1;')
            (root / 'tests').mkdir()
            profiles = root / 'sonarqube-config/quality-profiles'
            profiles.mkdir(parents=True)
            (profiles / 'python.xml').write_text(PROFILE)
            props = root / 'sonar-project.properties'
            props.write_text('sonar.sources=src\nsonar.tests=tests\n')
            with self.assertRaisesRegex(ValueError, 'without profile exports'):
                validator.validate_local(root)
            props.write_text('sonar.sources=missing\nsonar.tests=tests\n')
            with self.assertRaisesRegex(ValueError, 'Missing sonar.sources path'):
                validator.validate_local(root)

    def test_server_profile_assignment_and_rule_drift(self):
        props = {'sonar.host.url': 'http://sonar.invalid', 'sonar.projectKey': 'example'}
        profiles = {'py': ET.fromstring(PROFILE)}
        ready = json.dumps({'status': 'UP', 'version': 'test'}).encode()
        wrong = json.dumps({'profiles': [{'language': 'py', 'name': 'Sonar way'}]}).encode()
        assigned = json.dumps({'profiles': [{'language': 'py', 'name': 'python-profile'}]}).encode()
        with contextlib.redirect_stdout(io.StringIO()):
            with patch.object(validator, 'urlopen', side_effect=[io.BytesIO(ready), io.BytesIO(wrong)]):
                with self.assertRaisesRegex(ValueError, 'expected'):
                    validator.check_server(props, profiles)
            with patch.object(validator, 'urlopen', side_effect=[io.BytesIO(ready), io.BytesIO(assigned),
                              io.BytesIO(PROFILE.replace('MAJOR', 'MINOR').encode())]):
                with self.assertRaisesRegex(ValueError, 'rules differ'):
                    validator.check_server(props, profiles)
            gate = json.dumps({'qualityGate': {'name': 'Classroom'}}).encode()
            with patch.object(validator, 'urlopen', side_effect=[io.BytesIO(ready), io.BytesIO(assigned),
                              io.BytesIO(PROFILE.encode()), io.BytesIO(gate)]):
                validator.check_server(props, profiles)


if __name__ == '__main__':
    unittest.main()
