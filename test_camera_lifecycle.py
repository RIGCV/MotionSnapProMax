"""Hardware-free lifecycle regressions: python -m unittest test_camera_lifecycle."""
import os
os.environ.setdefault('QT_QPA_PLATFORM', 'offscreen')
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch
import numpy as np
import main


class Camera:
    def __init__(self, opened=True, error=False):
        self.opened, self.error = opened, error
        self.released = []
        self.reader = None
        self.entered = threading.Event()
        self.unblock = threading.Event()
        self.block = False

    def isOpened(self): return self.opened
    def set(self, *args): return True
    def read(self):
        self.reader = threading.get_ident()
        self.entered.set()
        if self.block: self.unblock.wait(3)
        if self.error: raise RuntimeError('unplugged')
        return False, None
    def release(self): self.released.append(threading.get_ident())


class LifecycleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = main.QApplication.instance() or main.QApplication([])

    def test_failed_open_releases(self):
        camera = Camera(opened=False)
        with patch.object(main.cv2, 'VideoCapture', return_value=camera):
            worker = main.VideoCaptureThread()
            worker.start()
            self.assertTrue(worker.wait(2000))
        self.assertEqual(len(camera.released), 1)

    def test_read_exception_releases_on_reader_thread(self):
        camera = Camera(error=True)
        with patch.object(main.cv2, 'VideoCapture', return_value=camera):
            worker = main.VideoCaptureThread()
            worker.start()
            self.assertTrue(worker.wait(2000))
        self.assertEqual(camera.released, [camera.reader])

    def test_stop_during_read_does_not_release_from_gui(self):
        camera = Camera()
        camera.block = True
        with patch.object(main.cv2, 'VideoCapture', return_value=camera):
            worker = main.VideoCaptureThread()
            worker.start()
            self.assertTrue(camera.entered.wait(2))
            worker.stop()
            self.assertEqual(camera.released, [])
            camera.unblock.set()
            self.assertTrue(worker.wait(2000))
        self.assertEqual(camera.released, [camera.reader])

    def test_stop_before_start_does_not_open_camera(self):
        with patch.object(main.cv2, 'VideoCapture') as factory:
            worker = main.VideoCaptureThread()
            worker.stop()
            worker.start()
            self.assertTrue(worker.wait(2000))
            factory.assert_not_called()

    def test_repeated_read_failures_exit(self):
        camera = Camera()
        with patch.object(main.cv2, 'VideoCapture', return_value=camera):
            worker = main.VideoCaptureThread()
            worker.start()
            self.assertTrue(worker.wait(2500))
        self.assertEqual(len(camera.released), 1)

    def test_window_start_stop_restart_and_close(self):
        camera = Camera()
        camera.block = True
        with patch.object(main.YOLODetector, 'load_model', return_value=True), patch.object(main.cv2, 'VideoCapture', return_value=camera) as factory:
            window = main.MainWindow()
            factory.assert_not_called()
            window.start_detection()
            self.assertTrue(camera.entered.wait(2))
            old = window.capture_thread
            window.stop_detection()
            window.start_detection()
            self.assertIs(window.capture_thread, old)
            self.assertFalse(window.is_detecting)
            camera.unblock.set()
            self.assertTrue(old.wait(2000))
            self.assertTrue(window.detection_thread.wait(2000))
            window.finish_stop()
            self.assertIsNone(window.capture_thread)
            self.assertIsNone(window.current_frame)
            window.start_detection()
            window.close()
            deadline = time.monotonic() + 3
            while window.isVisible() and time.monotonic() < deadline:
                self.app.processEvents()
                time.sleep(.01)
            self.assertFalse(window.isVisible())
            self.assertIsNone(window.capture_thread)

    def test_unicode_image_save_and_failed_encoding(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / '中文截图.jpg'
            main.MainWindow.save_image(str(path), np.zeros((10, 10, 3), np.uint8), 95)
            self.assertGreater(path.stat().st_size, 0)
            with self.assertRaises(FileExistsError):
                main.MainWindow.save_image(str(path), np.zeros((10, 10, 3), np.uint8), 95)
            with patch.object(main.cv2, 'imencode', return_value=(False, None)):
                with self.assertRaises(OSError):
                    main.MainWindow.save_image(str(Path(folder) / 'failed.jpg'), None, 95)


if __name__ == '__main__':
    unittest.main()
