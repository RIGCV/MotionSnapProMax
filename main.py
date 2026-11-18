# ========== 单文件运行支持 - 自动生成 ==========
import sys
import os

def resource_path(relative_path):
    """
    获取资源文件的绝对路径
    支持两种模式：
    1. 开发模式：使用当前目录
    2. 打包模式：使用临时解压目录
    """
    if hasattr(sys, '_MEIPASS'):
        # PyInstaller创建的临时文件夹
        base_path = sys._MEIPASS
    else:
        # 开发模式下的当前目录
        base_path = os.path.dirname(os.path.abspath(__file__))
    
    full_path = os.path.join(base_path, relative_path)
    # 确保路径是绝对路径且处理中文
    full_path = os.path.normpath(full_path)
    return full_path

# 全局变量，方便使用
BASE_PATH = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
# ========== 单文件运行支持结束 ==========

# 导入系统相关模块，用于系统级操作（如退出程序、平台判断）
import sys
# 导入文件操作模块，用于路径处理、文件夹创建、文件打开等
import os
# 导入OpenCV库，用于摄像头采集、图像处理、目标检测等核心视觉操作
import cv2
# 导入numpy数值计算库，用于数组处理、矩阵运算（OpenCV图像基于numpy数组）
import numpy as np
# 从datetime模块导入datetime类，用于生成时间戳、水印时间
from datetime import datetime
# 导入时间模块，用于计时、延时、判断时间间隔
import time
# 导入PIL库的Image/ImageDraw/ImageFont，用于添加中文水印（OpenCV对中文支持较差）
from PIL import Image, ImageDraw, ImageFont
# 导入PyQt5的所有窗口部件，用于构建图形界面（GUI）
from PyQt5.QtWidgets import *
# 导入PyQt5的核心模块，用于信号槽、定时器、线程、布局对齐等
from PyQt5.QtCore import *
# 导入PyQt5的图形模块，用于图像转换、绘图、像素处理、图标等
from PyQt5.QtGui import *
# 导入线程模块，用于实现摄像头采集、目标检测的多线程并行（避免界面卡顿）
import threading
# 导入队列模块，用于实现线程间的安全数据传递（帧缓冲区）
import queue
# 导入pathlib的Path类，用于更优雅的路径处理（本代码中未实际使用，预留扩展）
from pathlib import Path

# 全局样式配置 - 严谨配色、规范字体、合理间距、工业风视觉，基于QSS统一设置
STYLE_SHEET = """
/* 主窗口基础样式 - 深灰主色调，无边界，沉稳大气 */
QMainWindow {
    background-color: #12192c;  /* 工业深灰蓝，主背景色 */
    border: none;
}

/* 全局基础控件 - 统一字体体系，无默认边距 */
QWidget {
    font-family: "Microsoft YaHei UI", "Segoe UI", "Roboto", sans-serif;  /* 无衬线字体，跨平台兼容 */
    font-size: 14px;
    color: #e6e9ed;  /* 全局基础文字色，浅灰易读 */
    margin: 1;
    padding: 0;
}

/* 视频显示核心区域 - 深色背景，粗边框，大圆角，视觉核心 */
QLabel#videoLabel {
    background-color: #0a0f1a;  /* 超深灰蓝，视频背景底纹 */
    border: 3px solid #2c3e50;  /* 深灰边框，厚重感 */
    border-radius: 12px;  /* 大圆角，柔和但不失严谨 */
    color: #95a5a6;  /* 占位文字浅灰 */
    min-width: 480px;
    min-height: 360px;
    qproperty-alignment: AlignCenter;
}

/* 视频区域激活状态（检测中）- 警示蓝边框，醒目不刺眼 */
QLabel#videoLabel[status="active"] {
    border: 3px solid #3498db;  /* 工业蓝，检测中标识 */
    border-style: solid;
}

/* 视频覆盖层 - 半透明深黑背景，等宽字体，数据显示 */
QLabel#videoOverlay {
    background-color: rgba(0, 0, 0, 0.75);  /* 高透明度，不遮挡视频 */
    border-radius: 6px;
    color: #2ecc71;  /* 工业绿，数据显示色 */
    padding: 10px 12px;
    font-family: "Consolas", "Monaco", monospace;
    font-size: 20px;
    font-weight: 600;
}

/* 按钮基础样式 - 统一圆角、内边距，手型光标，无默认边框 */
QPushButton {
    border: none;
    border-radius: 8px;  /* 标准工业按钮圆角 */
    padding: 10px 20px;  /* 舒适点击区域 */
    font-size: 13px;
    font-weight: 700;
    color: #ffffff;
    min-width: 110px;
    max-width: 160px;
}

/* 主操作按钮 - 开始检测（工业绿渐变）*/
QPushButton#btnStart {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #27ae60, stop:1 #219653);
}
QPushButton#btnStart:hover {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #2ecc71, stop:1 #27ae60);
}
QPushButton#btnStart:disabled {
    background: #34495e;
    color: #7f8c8d;
}
/* 开始检测按钮-停止状态（工业红渐变）*/
QPushButton#btnStart[state="stop"] {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #e74c3c, stop:1 #c0392b);
}
QPushButton#btnStart[state="stop"]:hover {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #f1c40f, stop:1 #e74c3c);
}

/* 次要操作按钮 - 手动拍照（工业蓝渐变）*/
QPushButton#btnSnap {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #3498db, stop:1 #2980b9);
}
QPushButton#btnSnap:hover {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #4aa3df, stop:1 #3498db);
}

/* 功能按钮 - 文件夹/退出（工业深灰）*/
QPushButton#btnFolder, QPushButton#btnExit {
    background-color: #34495e;
    min-width: 90px;
}
QPushButton#btnFolder:hover, QPushButton#btnExit:hover {
    background-color: #4a6572;
}

/* 分组框 - 右侧面板容器，深灰底色，细边框，大圆角 */
QGroupBox {
    background-color: #1a2533;  /* 次级背景色，层次分明 */
    border: 2px solid #2c3e50;
    border-radius: 10px;
    margin-top: 15px;
    font-size: 14px;
    font-weight: 700;
    color: #3498db;  /* 工业蓝标题，醒目统一 */
    padding: 15px;
}
/* 分组框标题 - 定位，内边距优化 */
QGroupBox::title {
    subcontrol-origin: margin;
    left: 15px;
    padding: 0 10px;
    color: #3498db;
    font-size: 13px;
}

/* 核心状态标签 - 显示，居中，圆角，边框 */
QLabel#statusLabel {
    font-size: 15px;
    font-weight: 700;
    padding: 10px;
    border-radius: 6px;
    background-color: #1a2533;
    border: 1px solid #2c3e50;
    qproperty-alignment: AlignCenter;
    min-height: 40px;
}

/* 统计信息标签 - 等宽字体，数据展示 */
QLabel#statsLabel {
    font-size: 12px;
    color: #95a5a6;
    font-family: "Consolas", monospace;
    qproperty-alignment: AlignCenter;
    padding: 6px;
    border-radius: 4px;
    background-color: #1a2533;
    margin-top: 8px;
}

/* 运行日志 - 黑底，浅灰文字，细边框 */
QTextEdit {
    background-color: #0a0f1a;
    color: #e6e9ed;
    border: 1px solid #2c3e50;
    border-radius: 8px;
    padding: 10px;
    font-size: 11px;
    font-family: "Consolas", monospace;
}
QTextEdit:focus {
    border-color: #3498db;  /* 聚焦边框，交互 */
    outline: none;
}

/* 截图预览区域 - 深色背景，细边框，圆角 */
QLabel#previewLabel {
    background-color: #0a0f1a;
    border: 1px solid #2c3e50;
    border-radius: 8px;
    color: #7f8c8d;
    min-height: 180px;
    qproperty-alignment: AlignCenter;
}

/* 数值输入框和下拉框统一宽度 - 优化1：统一长度 */
QSpinBox, QDoubleSpinBox, QComboBox {
    background-color: #1a2533;
    color: #e6e9ed;
    border: 1px solid #2c3e50;
    border-radius: 6px;
    padding: 6px 8px;
    min-width: 120px;
    max-width: 120px;
    font-size: 12px;
}
QSpinBox:hover, QDoubleSpinBox:hover, QComboBox:hover {
    border-color: #3498db;
}

/* 优化2：上下按钮样式 - 区别于背景，圆角处理 */
QSpinBox::up-button, QDoubleSpinBox::up-button {
    background-color: #34495e;
    border-top-right-radius: 4px;
    border: none;
    width: 20px;
    margin: 1px 1px 0 0;
}
QSpinBox::up-button:hover, QDoubleSpinBox::up-button:hover {
    background-color: #3498db;  /* 工业蓝悬停 */
}
QSpinBox::down-button, QDoubleSpinBox::down-button {
    background-color: #34495e;
    border-bottom-right-radius: 4px;
    border: none;
    width: 20px;
    margin: 0 1px 1px 0;
}
QSpinBox::down-button:hover, QDoubleSpinBox::down-button:hover {
    background-color: #3498db;  /* 工业蓝悬停 */
}

/* 优化2：下拉按钮样式 - 区别于背景，圆角处理 */
QComboBox::drop-down {
    background-color: #34495e;
    border-top-right-radius: 6px;
    border-bottom-right-radius: 6px;
    border: none;
    width: 24px;
}
QComboBox::drop-down:hover {
    background-color: #3498db;  /* 工业蓝悬停 */
}
/* 使用CSS绘制下拉箭头，更美观且可控 */
QComboBox::down-arrow {
    image: none;
    border-left: 4px solid transparent;
    border-right: 4px solid transparent;
    border-top: 6px solid #e6e9ed;
    width: 0;
    height: 0;
    margin-top: 2px;
}

/* 下拉列表样式 - 深灰，选中工业蓝 */
QComboBox QAbstractItemView {
    background-color: #1a2533;
    color: #e6e9ed;
    border: 1px solid #2c3e50;
    selection-background-color: #3498db;
    selection-color: #ffffff;
    padding: 5px;
    border-radius: 4px;
}

/* 滚动区域 - 无边界，透明背景 */
QScrollArea {
    border: none;
    background: transparent;
}
/* 滚动条 - 细条，深灰样式 */
QScrollBar:vertical {
    background-color: #1a2533;
    width: 8px;
    border-radius: 4px;
}
QScrollBar::handle:vertical {
    background-color: #34495e;
    border-radius: 4px;
}
QScrollBar::handle:vertical:hover {
    background-color: #3498db;
}
QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {
    display: none;
}

/* 路径标签 - 小字体，浅灰，辅助信息 */
QLabel#pathLabel {
    color: #7f8c8d;
    font-size: 10px;
    word-wrap: true;
    margin-top: 10px;
    padding: 5px;
    border-radius: 4px;
    background-color: #1a2533;
}

/* 消息框 - 样式继承 */
QMessageBox {
    background-color: #12192c;
    border: 2px solid #2c3e50;
}
QMessageBox QLabel {
    color: #e6e9ed;
}
QMessageBox QPushButton {
    background-color: #3498db;
    min-width: 80px;
    max-width: 120px;
}
QMessageBox QPushButton:hover {
    background-color: #4aa3df;
}
"""

class FrameBuffer:
    """线程安全的帧缓冲区 - 用于摄像头采集线程与检测线程之间的帧传递，解耦两个线程"""
    def __init__(self, maxsize=2):
        # 初始化队列，设置最大容量（默认2帧），防止帧堆积
        self.queue = queue.Queue(maxsize=maxsize)
        # 保存最后一帧，当队列为空时返回最后一帧，保证画面不中断
        self.last_frame = None
        # 初始化线程锁，保证多线程操作last_frame时的线程安全
        self.lock = threading.Lock()
        
    def put(self, frame):
        """向缓冲区放入一帧图像，非阻塞方式，队列满时丢弃最旧帧"""
        try:
            # 非阻塞放入帧，队列满时直接抛出Full异常
            self.queue.put_nowait(frame)
        except queue.Full:
            # 队列满时，先取出最旧的一帧丢弃，再放入新帧
            try:
                self.queue.get_nowait()
                self.queue.put_nowait(frame)
            except queue.Empty:
                # 极端情况：取出时队列空，直接忽略
                pass
        
        # 加锁更新最后一帧，保证多线程下last_frame的一致性
        with self.lock:
            self.last_frame = frame.copy()
    
    def get(self, timeout=0.001):
        """从缓冲区获取一帧图像，带超时，队列为空时返回最后一帧"""
        try:
            # 超时获取帧，超时时间0.001秒，避免线程阻塞
            frame = self.queue.get(timeout=timeout)
            # 加锁更新最后一帧为当前获取的帧
            with self.lock:
                self.last_frame = frame.copy()
            return frame
        except queue.Empty:
            # 队列为空时，返回最后一帧的副本（若存在），否则返回None
            with self.lock:
                return self.last_frame.copy() if self.last_frame is not None else None

class MotionDetector:
    """动态人物检测器 - 结合背景减除算法与轮廓检测，实现运动区域提取，为YOLO过滤静态人物"""
    def __init__(self):
        # 初始化MOG2背景减除器：history=500（历史帧数量），varThreshold=25（方差阈值），detectShadows=False（不检测阴影，减少误判）
        self.bg_subtractor = cv2.createBackgroundSubtractorMOG2(
            history=500, 
            varThreshold=25, 
            detectShadows=False
        )
        self.min_contour_area = 500  # 最小轮廓面积，过滤微小的运动（如灰尘、光线变化）
        self.motion_threshold = 0.02  # 运动像素比例阈值（本代码中未实际使用，预留扩展）
        
    def detect_motion_regions(self, frame):
        """检测帧中的运动区域，返回运动区域的边界框列表和前景掩码"""
        # 将彩色帧转换为灰度图，减少计算量
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        # 高斯模糊：核大小(21,21)，标准差0，平滑图像，去除噪声
        gray = cv2.GaussianBlur(gray, (21, 21), 0)
        
        # 背景减除：输入灰度图，输出前景掩码（白色为运动区域，黑色为背景）
        fg_mask = self.bg_subtractor.apply(gray)
        
        # 形态学操作：先开运算（腐蚀+膨胀）去除小噪声，再闭运算（膨胀+腐蚀）填充运动区域内部空洞
        kernel = np.ones((5, 5), np.uint8)  # 形态学核
        fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_OPEN, kernel)
        fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_CLOSE, kernel)
        
        # 查找轮廓：RETR_EXTERNAL（只检测最外层轮廓），CHAIN_APPROX_SIMPLE（压缩轮廓点，减少数据量）
        contours, _ = cv2.findContours(fg_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        motion_regions = []  # 存储运动区域的边界框 (x, y, w, h)
        for cnt in contours:
            # 计算轮廓面积
            area = cv2.contourArea(cnt)
            # 过滤面积小于最小阈值的轮廓
            if area > self.min_contour_area:
                # 获取轮廓的边界框（x:左上角x坐标，y:左上角y坐标，w:宽度，h:高度）
                x, y, w, h = cv2.boundingRect(cnt)
                # 再次过滤过小的区域（宽/高小于50像素），进一步减少误判
                if w > 50 and h > 50:
                    motion_regions.append((x, y, w, h))
        
        # 返回运动区域列表和前景掩码
        return motion_regions, fg_mask
    
    def is_region_moving(self, bbox, motion_regions, iou_threshold=0.3):
        """判断YOLO检测框（bbox）是否与运动区域重叠，返回布尔值
        :param bbox: YOLO检测框 (x, y, w, h)
        :param motion_regions: 运动区域边界框列表
        :param iou_threshold: IoU阈值（交并比），大于该值则判定为重叠
        """
        # 解析YOLO检测框的坐标和面积
        x1, y1, w1, h1 = bbox
        box1_area = w1 * h1
        
        # 遍历所有运动区域
        for (x2, y2, w2, h2) in motion_regions:
            # 计算两个框的交集区域坐标
            xi1 = max(x1, x2)  # 交集左上角x
            yi1 = max(y1, y2)  # 交集左上角y
            xi2 = min(x1 + w1, x2 + w2)  # 交集右下角x
            yi2 = min(y1 + h1, y2 + h2)  # 交集右下角y
            
            # 若交集区域宽度/高度小于等于0，说明无重叠，跳过
            if xi2 <= xi1 or yi2 <= yi1:
                continue
                
            # 计算交集面积
            inter_area = (xi2 - xi1) * (yi2 - yi1)
            # 计算IoU（交并比）：交集面积 / YOLO检测框面积（只计算检测框的占比，更严格）
            iou = inter_area / box1_area
            
            # 若IoU大于阈值，判定为移动区域，返回True
            if iou > iou_threshold:
                return True
        
        # 备用判断：若IoU未达标，检查YOLO检测框的中心点是否在运动区域内（防止小运动区域漏判）
        cx, cy = x1 + w1//2, y1 + h1//2  # 检测框中心点坐标
        for (x2, y2, w2, h2) in motion_regions:
            if x2 <= cx <= x2 + w2 and y2 <= cy <= y2 + h2:
                return True
                
        # 无重叠，返回False
        return False

class YOLODetector:
    """优化的YOLO检测器 - 专注人物检测，结合运动检测器过滤静态人物，减少无效检测"""
    def __init__(self):
        self.confidence_threshold = 0.5  # 置信度阈值：检测结果置信度大于该值才保留
        self.nms_threshold = 0.4  # 非极大值抑制阈值：过滤重叠的检测框，保留最优结果
        self.net = None  # YOLO网络模型，load_model后初始化
        self.classes = []  # 类别名称列表，从coco.names加载
        self.colors = []  # 类别颜色列表，用于绘制检测框
        self.input_size = (320, 320)  # YOLO输入图像尺寸（320x320，速度快，精度适中）
        self.motion_detector = MotionDetector()  # 实例化运动检测器，用于过滤静态人物
        self.person_classes = ['person']  # 只检测人物类别，过滤其他目标（如汽车、狗）
        
    def load_model(self):
        """加载YOLO模型（优先yolov3-tiny，速度更快），返回是否加载成功"""
        try:
            # 定义模型文件对：(配置文件.cfg, 权重文件.weights)，优先加载轻量级的yolov3-tiny
            model_files = [
                (resource_path("yolov3-tiny.cfg"), resource_path("yolov3-tiny.weights")),
                (resource_path("yolov3.cfg"), resource_path("yolov3.weights"))
            ]
            
            config_path = weights_path = None  # 初始化配置/权重文件路径
            
            # 遍历模型文件对，检查是否存在，找到第一个存在的模型
            for cfg, weights in model_files:
                if os.path.exists(cfg) and os.path.exists(weights):
                    config_path = cfg
                    weights_path = weights
                    break
            
            classes_path = resource_path("coco.names")  # COCO类别名称文件路径
            
            # 检查模型配置/权重文件或类别文件是否存在，不存在则返回失败
            if not config_path or not os.path.exists(classes_path):
                return False
            
            # 从Darknet格式加载YOLO网络：配置文件+权重文件
            self.net = cv2.dnn.readNetFromDarknet(config_path, weights_path)
            # 设置网络后端为OpenCV（默认），目标为CPU（后续尝试切换为CUDA）
            self.net.setPreferableBackend(cv2.dnn.DNN_BACKEND_OPENCV)
            self.net.setPreferableTarget(cv2.dnn.DNN_TARGET_CPU)
            
            # 加载类别名称：从coco.names文件中读取每一行，去除空格/换行
            with open(classes_path, 'r') as f:
                self.classes = [line.strip() for line in f.readlines()]
            
            # 生成类别颜色：为每个类别生成随机RGB颜色，固定随机种子保证颜色一致
            np.random.seed(42)
            self.colors = np.random.randint(0, 255, size=(len(self.classes), 3), dtype="uint8")
            
            # 默认使用可用的 CPU 后端，避免延迟到首次推理才发现 CUDA 不可用。
            # 模型加载成功，返回True
            return True
        except Exception as e:
            # 捕获所有异常，打印错误信息，返回False
            print(f"模型加载失败: {e}")
            return False
    
    def detect_persons(self, frame, only_moving=True):
        """检测帧中的人物，可选择只检测移动的人物
        :param frame: 输入彩色帧
        :param only_moving: 是否只检测移动人物（True：结合运动检测器过滤，False：检测所有人物）
        :return: 绘制了检测框的帧、检测到的人物信息列表
        """
        # 若模型未加载，直接返回原帧和空列表
        if self.net is None:
            return frame, []
        
        # 获取帧的高度和宽度，用于后续坐标转换
        height, width = frame.shape[:2]
        # 复制原帧，防止后续操作修改原帧
        original_frame = frame.copy()
        
        # 初始化运动区域列表
        motion_regions = []
        if only_moving:
            # 若只检测移动人物，调用运动检测器获取运动区域
            motion_regions, _ = self.motion_detector.detect_motion_regions(original_frame)
            # 可视化运动区域（调试用，注释掉则不显示）
            # for (x, y, w, h) in motion_regions:
            #     cv2.rectangle(frame, (x, y), (x+w, y+h), (0, 255, 255), 1)
        
        # YOLO推理第一步：将帧转换为blob（深度学习输入格式）
        # 1/255.0：像素值归一化到0-1；swapRB=True：交换R和B通道（OpenCV是BGR，YOLO需要RGB）；crop=False：不裁剪
        blob = cv2.dnn.blobFromImage(frame, 1/255.0, self.input_size, swapRB=True, crop=False)
        # 将blob设置为网络输入
        self.net.setInput(blob)
        
        # 获取网络的所有层名称，以及输出层名称（未连接的层，即YOLO的检测输出层）
        layer_names = self.net.getLayerNames()
        output_layers = [layer_names[i - 1] for i in self.net.getUnconnectedOutLayers()]
        # 前向传播：运行推理，获取输出层的检测结果
        outputs = self.net.forward(output_layers)
        
        # 初始化存储检测结果的列表
        boxes = []  # 检测框坐标列表 (x, y, w, h)
        confidences = []  # 检测置信度列表
        class_ids = []  # 检测类别ID列表
        
        # 遍历所有输出层的检测结果
        for output in outputs:
            for detection in output:
                # detection结构：[center_x, center_y, w, h, confidence, class1_score, class2_score, ...]
                scores = detection[5:]  # 所有类别的得分
                class_id = np.argmax(scores)  # 得分最高的类别ID
                confidence = scores[class_id]  # 该类别的置信度
                
                # 过滤条件：置信度大于阈值 + 类别是人物
                if confidence > self.confidence_threshold and self.classes[class_id] in self.person_classes:
                    # 将YOLO的归一化坐标转换为原帧的像素坐标
                    center_x = int(detection[0] * width)
                    center_y = int(detection[1] * height)
                    w = int(detection[2] * width)
                    h = int(detection[3] * height)
                    
                    # 将中心坐标转换为左上角坐标
                    x = int(center_x - w / 2)
                    y = int(center_y - h / 2)
                    
                    # 将检测结果添加到对应列表
                    boxes.append([x, y, w, h])
                    confidences.append(float(confidence))
                    class_ids.append(class_id)
        
        # 非极大值抑制（NMS）：过滤重叠的检测框，保留置信度最高的框
        indices = cv2.dnn.NMSBoxes(boxes, confidences, self.confidence_threshold, self.nms_threshold)
        
        detected_persons = []  # 存储最终检测到的人物信息
        # 若存在有效检测结果
        if len(indices) > 0:
            # 遍历NMS后的检测框索引（flatten：将多维数组展平为一维）
            for i in indices.flatten():
                x, y, w, h = boxes[i]  # 获取检测框坐标
                
                # 若只检测移动人物，判断该检测框是否与运动区域重叠
                if only_moving:
                    if not self.motion_detector.is_region_moving((x, y, w, h), motion_regions):
                        continue  # 非移动人物，跳过
                
                # 获取人物标签、置信度，设置检测框颜色（工业绿：(34,198,104)）
                label = str(self.classes[class_ids[i]])
                confidence = confidences[i]
                color = [34, 198, 104]  # 绿色，区分于其他目标，更柔和
                
                # 绘制人物检测框：原帧，左上角，右下角，颜色，线宽2
                cv2.rectangle(frame, (x, y), (x + w, y + h), color, 1)
                
                # 绘制标签背景：先计算文字尺寸，再绘制带内边距的矩形背景
                text = f"{label} {confidence:.2f}"  # 标签文字：人物+置信度（保留2位小数）
                (text_w, text_h), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)  # 计算文字宽高
                cv2.rectangle(frame, (x, y - text_h - 6), (x + text_w + 6, y), color, 1)  # 绘制背景矩形（-1：填充）
                # 绘制标签文字：白色，字体大小0.5，线宽2
                cv2.putText(frame, text, (x + 4, y - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 0, 0), 1)
                
                # 将人物信息添加到列表（标签、置信度、检测框）
                detected_persons.append({
                    'label': label,
                    'confidence': confidence,
                    'bbox': (x, y, w, h)
                })
        
        # 返回绘制了检测框的帧和检测到的人物信息列表
        return frame, detected_persons

class DetectionThread(QThread):
    """检测线程 - 继承QThread，独立于主线程执行YOLO检测，避免界面卡顿"""
    # 定义自定义信号：检测完成后发送（绘制后的帧、人物信息列表），支持跨线程通信
    detection_ready = pyqtSignal(np.ndarray, list)
    # 定义自定义信号：检测出错时发送错误信息
    error_occurred = pyqtSignal(str)
    
    def __init__(self, yolo_detector):
        super().__init__()  # 调用父类构造函数
        self.yolo_detector = yolo_detector  # 传入YOLO检测器实例
        self.frame_buffer = FrameBuffer(maxsize=1)  # 初始化帧缓冲区，容量1（只保留最新帧）
        self.running = False
        self.stop_event = threading.Event()
        self.process_every_n_frames = 2  # 每N帧处理一次，默认2帧（平衡模式）
        self.frame_counter = 0  # 帧计数器，用于实现跳帧处理
    
    def add_frame(self, frame):
        """向帧缓冲区添加一帧，供检测线程处理"""
        self.frame_buffer.put(frame)
    
    def run(self):
        """线程核心运行方法 - QThread固定重写方法，启动线程后自动执行"""
        self.running = True  # 设置运行标志为True
        # 线程主循环
        while not self.stop_event.is_set():
            # 从缓冲区获取帧，超时0.01秒，避免线程阻塞
            frame = self.frame_buffer.get(timeout=0.01)
            if frame is None:
                continue  # 无帧则跳过
                
            self.frame_counter += 1  # 帧计数器加1
            
            # 跳帧处理：只有计数器是N的倍数时，才执行YOLO检测，减少计算量
            if self.frame_counter % self.process_every_n_frames == 0:
                try:
                    # 执行YOLO检测，只检测移动人物
                    detected_frame, persons = self.yolo_detector.detect_persons(frame, only_moving=True)
                    # 发送检测完成信号，将结果传递给主线程
                    if not self.stop_event.is_set():
                        self.detection_ready.emit(detected_frame, persons)
                except Exception as e:
                    # 捕获检测异常，发送错误信号
                    self.error_occurred.emit(f"检测错误: {str(e)}")
                    break
            else:
                # 不处理的帧，直接发送原帧和空人物列表，保证画面实时性
                self.detection_ready.emit(frame, [])
    
    def stop(self):
        """停止线程，设置运行标志为False，等待线程退出（最多500毫秒）"""
        self.running = False
        self.stop_event.set()

class VideoCaptureThread(QThread):
    """视频采集线程 - 继承QThread，独立于主线程采集摄像头帧，避免界面卡顿"""
    # 定义自定义信号：采集到帧后发送（numpy数组格式的帧）
    # 定义自定义信号：采集出错时发送错误信息
    error_occurred = pyqtSignal(str)
    # 定义自定义信号：FPS更新时发送（当前采集帧率）
    fps_updated = pyqtSignal(float)
    
    def __init__(self, camera_id=0):
        super().__init__()
        self.camera_id = camera_id
        self.cap = None
        self.stop_event = threading.Event()
        self.frame_buffer = FrameBuffer(maxsize=1)

    def run(self):
        """设备的打开、读取、释放始终在同一线程执行。"""
        try:
            if self.stop_event.is_set():
                return
            backend = cv2.CAP_DSHOW if sys.platform == "win32" else cv2.CAP_ANY
            self.cap = cv2.VideoCapture(self.camera_id, backend)
            if not self.cap.isOpened():
                raise RuntimeError("无法打开摄像头，请检查相机权限及其他应用是否占用设备")
            if self.stop_event.is_set():
                return
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
            self.cap.set(cv2.CAP_PROP_FPS, 30)
            failures = count = 0
            last_time = time.monotonic()
            while not self.stop_event.is_set():
                started = time.monotonic()
                ok, frame = self.cap.read()
                if self.stop_event.is_set():
                    break
                if not ok or frame is None or frame.size == 0:
                    failures += 1
                    if failures >= 10:
                        raise RuntimeError("摄像头连续读取失败，设备可能已断开或被占用；已停止采集")
                    self.stop_event.wait(0.1)
                    continue
                failures = 0
                self.frame_buffer.put(frame)
                count += 1
                now = time.monotonic()
                if now - last_time >= 1:
                    self.fps_updated.emit(count / (now - last_time))
                    count, last_time = 0, now
                self.stop_event.wait(max(0, 1 / 30 - (time.monotonic() - started)))
        except Exception as error:
            if not self.stop_event.is_set():
                self.error_occurred.emit(str(error))
        finally:
            if self.cap is not None:
                self.cap.release()
                self.cap = None

    def stop(self):
        # 不在 GUI 线程 release，也不强制终止驱动调用。
        self.stop_event.set()

class MainWindow(QMainWindow):
    """主窗口类 - 继承QMainWindow，程序核心界面，整合所有功能模块"""
    def __init__(self):
        super().__init__()  # 调用父类构造函数
        self.setWindowTitle("智能动态监控系统 V2.4")  # 窗口标题，增加版本号
        
        # 响应式窗口设置：标准尺寸，适配工控机和普通电脑
        self.setMinimumSize(1100, 700)
        self.resize(1300, 800)
        
        # ========== 新增：窗口图标设置 - 视觉标识 ==========
        self.setWindowIcon(self.create_industry_icon())  # 设置自定义窗口图标
        
        # ========== 新增：拖动标题栏保持全屏的支持 ==========
        self._maximize_timer = QTimer(self)
        self._maximize_timer.setSingleShot(True)
        self._maximize_timer.timeout.connect(self._auto_remaximize)
        self._is_dragging_window = False
        
        # 获取桌面路径 - 使用Qt标准路径API，保证跨平台兼容（Windows/macOS/Linux）
        desktop_path = QStandardPaths.writableLocation(QStandardPaths.DesktopLocation)
        # 若Qt标准路径获取失败，使用系统默认桌面路径
        if not desktop_path:
            desktop_path = os.path.join(os.path.expanduser("~"), "Desktop")
        
        # 设置截图保存路径：桌面/screenshots文件夹
        self.screenshot_dir = os.path.join(desktop_path, "Screenshots")
        os.makedirs(self.screenshot_dir, exist_ok=True)  # 创建文件夹，已存在则不报错
        
        # 初始化核心模块实例
        self.yolo_detector = YOLODetector()  # YOLO检测器
        self.capture_thread = None  # 视频采集线程（后续初始化）
        self.detection_thread = None  # 目标检测线程（后续初始化）
        
        # 初始化系统状态变量
        self.is_detecting = False  # 是否正在检测
        self.current_frame = None  # 当前显示的帧
        self.screenshot_count = 0  # 累计截图数量
        self.last_capture_time = 0  # 上一次自动截图的时间（用于控制截图间隔）
        self.capture_interval = 1.0  # 自动截图间隔（秒），默认1秒
        self.current_fps = 0  # 当前摄像头采集帧率
        self.last_persons = []  # 最新检测人物列表，初始化空列表
        
        self.setStyleSheet(STYLE_SHEET)  # 加载全局QSS样式
        self.setup_ui()  # 初始化界面布局和控件
        self.setWindowFlags(Qt.Window | Qt.WindowMinimizeButtonHint | Qt.WindowCloseButtonHint)
        
        # ========== 修改2：窗口启动后自动全屏显示（保留标题栏）==========
        self.showMaximized()
        
        # 启动摄像头预览（程序启动后直接打开摄像头）
        self.status_label.setText("摄像头未开启，点击开始检测")
        
        # 初始化UI更新定时器：每隔10毫秒更新一次界面（约30FPS，保证画面流畅）
        self.ui_timer = QTimer()
        self.ui_timer.timeout.connect(self.update_ui)  # 绑定定时器超时信号到更新方法
        self.ui_timer.start(33)
        self._closing = False
        self._stopping = False
        self.last_error = None
        self.shutdown_timer = QTimer(self)
        self.shutdown_timer.timeout.connect(self.finish_stop)
        
        # 加载YOLO模型，初始化模型加载状态
        self.model_loaded = self.yolo_detector.load_model()
        if not self.model_loaded:
            # 模型加载失败，记录警告日志
            self.log_message("⚠️ 模型加载失败，请检查yolov3-tiny/yolov3文件", "warning")
        else:
            # 模型加载成功，启用开始检测按钮，记录成功日志
            self.btn_start.setEnabled(True)
            self.log_message("✅ YOLO模型加载成功，可开始检测移动人物")
    
    def changeEvent(self, event):
        """重写窗口状态变化事件 - 处理拖动标题栏时的全屏保持"""
        if event.type() == QEvent.WindowStateChange:
            old_state = event.oldState()
            new_state = self.windowState()
            
            # 检测是否从最大化状态变为正常状态（拖动标题栏会触发此变化）
            if (old_state & Qt.WindowMaximized) and not (new_state & Qt.WindowMaximized):
                self._is_dragging_window = True
                # 启动延迟定时器，等待拖动完成（300ms内如果没有新的移动事件，则认为拖动结束）
                self._maximize_timer.start(300)
            elif (new_state & Qt.WindowMaximized):
                # 窗口已最大化，重置拖动标志
                self._is_dragging_window = False
                self._maximize_timer.stop()
        
        super().changeEvent(event)
    
    def moveEvent(self, event):
        """重写窗口移动事件 - 处理拖动过程中的状态保持"""
        if self._is_dragging_window:
            # 窗口正在被拖动，重置定时器（说明还在移动中）
            self._maximize_timer.stop()
            self._maximize_timer.start(300)
        super().moveEvent(event)
    
    def _auto_remaximize(self):
        """拖动完成后自动重新最大化到新屏幕"""
        if self._is_dragging_window and not self.isMaximized():
            # 获取窗口当前中心点所在的屏幕
            screen = QApplication.screenAt(self.geometry().center())
            if screen:
                # 设置窗口几何为屏幕可用几何（最大化区域）
                self.setGeometry(screen.availableGeometry())
            # 重新显示为最大化状态
            self.showMaximized()
            self._is_dragging_window = False
    
    def create_industry_icon(self):
        """创建窗口图标 - 自定义绘制，无需外部文件，避免依赖"""
        icon_size = 64
        # 创建画布
        pixmap = QPixmap(icon_size, icon_size)
        pixmap.fill(Qt.transparent)
        painter = QPainter(pixmap)
        painter.setRenderHint(QPainter.Antialiasing)  # 抗锯齿，精细度
        
        # 绘制图标背景（深灰蓝圆形）
        painter.setPen(QPen(QColor(44, 62, 80), 3, Qt.SolidLine))
        painter.setBrush(QBrush(QColor(18, 25, 44)))
        painter.drawEllipse(2, 2, icon_size-4, icon_size-4)
        
        # 绘制摄像头轮廓（工业蓝）
        painter.setPen(QPen(QColor(52, 152, 219), 2, Qt.SolidLine))
        painter.setBrush(Qt.NoBrush)
        # 摄像头主体
        painter.drawRect(16, 20, 32, 20)
        # 摄像头镜头
        painter.setBrush(QBrush(QColor(52, 152, 219)))
        painter.drawEllipse(28, 26, 8, 8)
        # 摄像头支架
        painter.setPen(QPen(QColor(52, 152, 219), 2, Qt.SolidLine))
        painter.drawLine(32, 40, 32, 50)
        painter.drawLine(22, 50, 42, 50)
        
        painter.end()
        return QIcon(pixmap)
    
    def setup_ui(self):
        """初始化界面布局和所有控件，优化间距、层级、视觉焦点"""
        # 创建中心窗口部件（QMainWindow必须设置中心部件）
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        
        # 创建水平主布局：黄金比例，左侧视频区占2.5份，右侧控制面板占1份
        main_layout = QHBoxLayout(central_widget)
        main_layout.setSpacing(10)  # 增大间距，界面呼吸感
        main_layout.setContentsMargins(20, 20, 20, 20)  # 标准外边距
        
        # ---------------------- 左侧区域：视频显示 ----------------------
        left_panel = QWidget()  # 左侧面板容器
        left_layout = QVBoxLayout(left_panel)  # 左侧面板垂直布局
        left_layout.setSpacing(12)  # 控件间距优化
        left_layout.setContentsMargins(0, 0, 0, 0)
        
        # 视频显示标签：核心显示区域，命名为videoLabel（对应QSS样式）
        self.video_label = QLabel("📹 摄像头初始化中...")  # 占位文字
        self.video_label.setObjectName("videoLabel")  # 设置控件唯一标识，用于QSS样式定位
        self.video_label.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)  # 响应式：占满可用空间
        self.video_label.setMinimumSize(600, 380)  # 增大最小尺寸，视觉
        
        # ========== 优化：视频覆盖层 - 重命名为videoOverlay，绑定QSS，优化布局 ==========
        self.video_overlay = QLabel(self.video_label)  # 父控件为videoLabel，随视频区域移动
        self.video_overlay.setObjectName("videoOverlay")  # 绑定QSS样式
        self.video_overlay.setGeometry(15, 15, 600, 65)  # 调整位置和尺寸，比例
        self.video_overlay.setText("FPS: --   |   状态: 待机模式   |   移动对象: 0")  # 状态文字
        self.video_overlay.setAttribute(Qt.WA_TransparentForMouseEvents)  # 设置鼠标事件透明
        
        left_layout.addWidget(self.video_label, stretch=1)  # 添加视频标签，占满左侧面板可用空间
        
        # ========== 修改1：按钮区域改为2x2网格布局，后续将添加到右侧面板 ==========
        # 控制按钮区域：网格布局，2x2排列，优化间距和顺序
        btn_widget = QWidget()
        btn_layout = QGridLayout(btn_widget)
        btn_layout.setSpacing(10)  # 减小按钮间距
        btn_layout.setContentsMargins(5, 5, 5, 5)  # 减小内边距
        
        # 开始/停止检测按钮：图标+文字，绑定状态属性
        self.btn_start = QPushButton("🚀 开始检测")
        self.btn_start.setObjectName("btnStart")  # 设置QSS标识
        self.btn_start.setEnabled(False)  # 初始禁用，模型加载成功后启用
        self.btn_start.setCursor(Qt.PointingHandCursor)  # 鼠标悬浮为手型
        self.btn_start.clicked.connect(self.toggle_detection)  # 绑定点击事件到检测开关方法
        
        # 手动拍照按钮：相机图标
        self.btn_snap = QPushButton("📸 手动抓拍")
        self.btn_snap.setObjectName("btnSnap")  # 设置QSS标识
        self.btn_snap.setCursor(Qt.PointingHandCursor)
        self.btn_snap.clicked.connect(self.manual_capture)  # 绑定点击事件到手动拍照方法
        
        # 打开截图文件夹按钮：文件夹图标
        self.btn_folder = QPushButton("📁 图片管理")
        self.btn_folder.setObjectName("btnFolder")  # QSS标识
        self.btn_folder.setCursor(Qt.PointingHandCursor)
        self.btn_folder.clicked.connect(self.open_screenshot_folder)  # 绑定点击事件
        
        # 退出程序按钮：退出图标
        self.btn_exit = QPushButton("🔴 退出系统")
        self.btn_exit.setObjectName("btnExit")  # 设置QSS标识
        self.btn_exit.setCursor(Qt.PointingHandCursor)
        self.btn_exit.clicked.connect(self.close)  # 绑定点击事件到窗口关闭方法
        
        # 将按钮添加到网格布局，2行2列（布局，功能分区清晰）
        btn_layout.addWidget(self.btn_start, 0, 0)
        btn_layout.addWidget(self.btn_snap, 0, 1)
        btn_layout.addWidget(self.btn_folder, 1, 0)
        btn_layout.addWidget(self.btn_exit, 1, 1)
        
        # 注意：按钮区域将被添加到右侧面板，不在左侧显示
        
        # ---------------------- 右侧控制面板：可滚动，优化分组和间距 ----------------------
        right_scroll = QScrollArea()  # 滚动区域，适配工控机小屏幕
        right_scroll.setWidgetResizable(True)  # 滚动区域内的部件随滚动区域大小调整
        right_scroll.setMaximumWidth(400)  # 增大最大宽度，控件展示
        right_scroll.setMinimumWidth(300)  # 增大最小宽度
        right_scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)  # 隐藏水平滚动条
        right_scroll.setStyleSheet("QScrollArea { border: none; background: transparent; }")
        
        right_widget = QWidget()  # 滚动区域的内容容器
        right_layout = QVBoxLayout(right_widget)  # 内容容器垂直布局
        right_layout.setSpacing(10)  # 减小分组间距
        right_layout.setContentsMargins(0, 5, 0, 5)
        right_layout.setAlignment(Qt.AlignTop)  # 内容顶部对齐
        
        # 修改1：将按钮区域添加到右侧面板最上方（设备运行状态卡片上面）
        right_layout.addWidget(btn_widget)
        
        # 1. 系统状态组：标题，核心状态展示
        status_group = QGroupBox("📊 设备运行状态")
        status_vlayout = QVBoxLayout()  # 垂直布局
        status_vlayout.setSpacing(10)  # 减小控件间距
        status_vlayout.setContentsMargins(8, 5, 8, 5)  # 减小内边距
        
        self.status_label = QLabel("⏳ 系统初始化完成，等待启动")  # 状态文字
        self.status_label.setObjectName("statusLabel")  # 设置QSS标识
        
        self.stats_label = QLabel("抓拍总数: 0 | 移动目标: 0 | 采集帧率: 0.0 FPS")  # 统计文字
        self.stats_label.setObjectName("statsLabel")  # 设置QSS标识
        
        status_vlayout.addWidget(self.status_label)
        status_vlayout.addWidget(self.stats_label)
        status_group.setLayout(status_vlayout)
        
        # 2. 检测参数组：参数设置，优化标签文字
        settings_group = QGroupBox("⚙️ 检测参数配置")
        settings_vlayout = QVBoxLayout()  # 垂直布局
        settings_vlayout.setSpacing(0)  # 减小控件间距
        settings_vlayout.setContentsMargins(8, 5, 8, 5)  # 减小内边距
        
        # 置信度设置：标签，优化布局
        conf_layout = QHBoxLayout()
        conf_label = QLabel("物体检测置信度  :    ")
        conf_label.setMinimumWidth(80)  # 固定标签宽度，对齐
        self.conf_spinbox = QDoubleSpinBox()  # 浮点数字框
        self.conf_spinbox.setRange(0.1, 1.0)  # 范围0.1-1.0
        self.conf_spinbox.setSingleStep(0.05)  # 步长0.05
        self.conf_spinbox.setValue(0.5)  # 默认值0.5
        self.conf_spinbox.valueChanged.connect(self.update_threshold)  # 绑定值变化事件
        conf_layout.addWidget(conf_label)
        conf_layout.addWidget(self.conf_spinbox)
        conf_layout.addStretch()
        
        # 截图间隔设置：标签
        interval_layout = QHBoxLayout()
        interval_label = QLabel("自动抓拍间隔 (s) :   ")
        interval_label.setMinimumWidth(80)
        self.interval_spinbox = QDoubleSpinBox()  # 浮点数字框
        self.interval_spinbox.setRange(0.5, 10.0)  # 范围0.5-10秒
        self.interval_spinbox.setSingleStep(0.5)  # 步长0.5秒
        self.interval_spinbox.setValue(1.0)  # 默认值1秒
        self.interval_spinbox.valueChanged.connect(self.update_interval)  # 绑定值变化事件
        interval_layout.addWidget(interval_label)
        interval_layout.addWidget(self.interval_spinbox)
        interval_layout.addStretch()
        
        # 处理模式设置：标签，优化选项文字
        skip_layout = QHBoxLayout()
        skip_label = QLabel("检 测 运 行 模 式 :   ")
        skip_label.setMinimumWidth(80)
        self.skip_combo = QComboBox()  # 下拉组合框
        self.skip_combo.addItems(["实时检测 (每帧)", "平衡模式 (每2帧)", "节能模式 (每3帧)"])  # 模式名称
        self.skip_combo.currentIndexChanged.connect(self.update_skip)  # 绑定索引变化事件
        skip_layout.addWidget(skip_label)
        skip_layout.addWidget(self.skip_combo)
        skip_layout.addStretch()
        
        # 将三个参数布局添加到设置组垂直布局
        settings_vlayout.addLayout(conf_layout)
        settings_vlayout.addLayout(interval_layout)
        settings_vlayout.addLayout(skip_layout)
        settings_group.setLayout(settings_vlayout)
        
        # 3. 运行日志组：日志展示，增大高度
        log_group = QGroupBox("📝 系统运行日志")
        log_layout = QVBoxLayout()
        log_layout.setContentsMargins(8, 5, 8, 5)  # 减小内边距
        
        self.log_text = QTextEdit()  # 文本编辑框，用于显示日志
        self.log_text.document().setMaximumBlockCount(500)
        self.log_text.setReadOnly(True)  # 设置为只读，防止用户编辑
        self.log_text.setMaximumHeight(120)  # 减小最大高度
        self.log_text.setMinimumHeight(120)  # 减小最小高度
        log_layout.addWidget(self.log_text)
        log_group.setLayout(log_layout)
        
        # 4. 最新截图预览组：预览，优化尺寸
        preview_group = QGroupBox("🖼️ 最新抓拍预览")
        preview_layout = QVBoxLayout()
        preview_layout.setContentsMargins(8, 5, 8, 5)  # 减小内边距
        
        self.preview_label = QLabel("📸 暂无抓拍记录")  # 占位文字
        self.preview_label.setObjectName("previewLabel")  # 设置QSS标识
        self.preview_label.setMinimumHeight(150)  # 减小最小高度
        self.preview_label.setMaximumHeight(160)  # 减小最大高度
        
        preview_layout.addWidget(self.preview_label)
        preview_group.setLayout(preview_layout)
        
        # 5. 保存路径信息：标签，重命名为pathLabel，绑定QSS
        self.path_label = QLabel(f"📂 所有图片保存路径: {self.screenshot_dir}")
        self.path_label.setObjectName("pathLabel")  # 绑定QSS样式
        self.path_label.setWordWrap(True)  # 自动换行
        
        # 将所有分组框和路径标签添加到右侧面板布局
        right_layout.addWidget(status_group)
        right_layout.addWidget(settings_group)
        right_layout.addWidget(log_group)
        right_layout.addWidget(preview_group)
        right_layout.addWidget(self.path_label)
        right_layout.addStretch()
        
        # ========== 新增：版权信息标签（右下角显示）==========
        self.copyright_label = QLabel("© 2026 智能动态监控系统 版权所有 | WNB666")
        self.copyright_label.setAlignment(Qt.AlignCenter)
        self.copyright_label.setStyleSheet("color: #7f8c8d; font-size: 16px; margin-top: 2px; padding: 5px;")
        right_layout.addWidget(self.copyright_label)
        
        right_widget.setLayout(right_layout)
        right_scroll.setWidget(right_widget)
        
        # ---------------------- 主布局组装：比例分配 ----------------------
        main_layout.addWidget(left_panel, stretch=25)  # 左侧视频区占25份
        main_layout.addWidget(right_scroll, stretch=10)  # 右侧控制面板占10份
    
    def start_camera_preview(self):
        """启动摄像头预览，初始化并启动采集线程"""
        # 实例化视频采集线程，摄像头ID=0
        if self.capture_thread is not None:
            return
        self.capture_thread = VideoCaptureThread(camera_id=0)
        # 绑定采集线程的信号到对应的槽函数
        self.capture_thread.error_occurred.connect(self.on_camera_error)  # 错误信号
        self.capture_thread.fps_updated.connect(self.on_fps_updated)  # FPS更新信号
        self.capture_thread.start()  # 启动采集线程
        
        # 更新界面状态：设置状态标签文字和颜色，记录日志
        self.status_label.setText("摄像头正在启动…")
        self.status_label.setStyleSheet("color: #3498db;")  # 工业蓝
        self.log_message("正在请求摄像头，等待画面")
    
    def on_frame_ready(self, frame):
        """采集线程帧就绪信号的槽函数 - 接收采集到的帧，分发给检测线程（若检测中）"""
        if not self.is_detecting or self._closing:
            return
        self.current_frame = frame  # 更新当前帧
        # 若正在检测且检测线程已初始化，将帧添加到检测线程的帧缓冲区
        if self.is_detecting and self.detection_thread:
            self.detection_thread.add_frame(frame.copy())
    
    def on_fps_updated(self, fps):
        """采集线程FPS更新信号的槽函数 - 更新当前帧率"""
        self.current_fps = fps
    
    def toggle_detection(self):
        """检测开关 - 根据当前状态启动/停止检测"""
        if not self.is_detecting:
            self.start_detection()
        else:
            self.stop_detection()
    
    def start_detection(self):
        """启动目标检测，初始化并启动检测线程"""
        # 检查模型是否加载成功，未加载则弹出警告框（优化3：添加窗口图标）
        if not self.model_loaded:
            msg = QMessageBox(self)
            msg.setWindowIcon(self.windowIcon())
            msg.setIcon(QMessageBox.Warning)
            msg.setWindowTitle("设备警告")
            msg.setText("检测模型未加载，无法启动检测")
            msg.setStandardButtons(QMessageBox.Ok)
            msg.exec_()
            return
        
        if self._stopping or self._closing or self.is_detecting:
            return
        self.last_error = None
        self.yolo_detector.motion_detector = MotionDetector()
        self.is_detecting = True
        self.start_camera_preview()
        
        # 实例化检测线程，传入YOLO检测器实例
        self.detection_thread = DetectionThread(self.yolo_detector)
        # 绑定检测线程的信号到对应的槽函数
        self.detection_thread.detection_ready.connect(self.on_detection_result)  # 检测完成信号
        self.detection_thread.error_occurred.connect(self.on_detection_error)  # 错误信号
        self.detection_thread.process_every_n_frames = [1, 2, 3][self.skip_combo.currentIndex()]
        self.detection_thread.start()  # 启动检测线程
        
        # ========== 优化：按钮状态更新 - 设置属性而非直接改样式，兼容QSS ==========
        self.btn_start.setText("🛑 停止检测")
        self.btn_start.setProperty("state", "stop")  # 设置停止状态属性
        self.btn_start.style().unpolish(self.btn_start)
        self.btn_start.style().polish(self.btn_start)
        
        # 激活视频区域边框，检测中标识
        self.video_label.setProperty("status", "active")
        self.style().unpolish(self.video_label)
        self.style().polish(self.video_label)
        
        # 更新状态标签
        self.status_label.setText("🔍 移动目标正在检测中...")
        self.status_label.setStyleSheet("color: #27ae60;")  # 工业绿
        self.log_message("🚀 启动移动目标检测，仅捕捉动态人物")
    
    def stop_detection(self):
        """停止目标检测，销毁检测线程"""
        self.is_detecting = False  # 设置检测状态为False
        
        self._stopping = True
        self.btn_start.setEnabled(False)
        for worker in (self.capture_thread, self.detection_thread):
            if worker is not None:
                worker.stop()
        self.current_frame = None
        self.last_persons = []
        self.current_fps = 0
        self.video_label.clear()
        self.video_label.setText("摄像头正在释放…")
        self.video_overlay.setText("正在停止")
        self.shutdown_timer.start(50)

        # ========== 优化：恢复按钮状态 - 清除属性，兼容QSS ==========
        self.btn_start.setText("🚀 开始检测")
        self.btn_start.setProperty("state", "")  # 清除状态属性
        self.btn_start.style().unpolish(self.btn_start)
        self.btn_start.style().polish(self.btn_start)
        
        # 取消视频区域激活状态
        self.video_label.setProperty("status", "")
        self.style().unpolish(self.video_label)
        self.style().polish(self.video_label)
        
        # 更新状态标签
        self.status_label.setText("正在停止并释放摄像头…")
        self.status_label.setStyleSheet("color: #3498db;")  # 工业蓝
        self.log_message("正在停止检测与摄像头采集")
    
    def finish_stop(self):
        if any(w is not None and w.isRunning() for w in (self.capture_thread, self.detection_thread)):
            return
        self.shutdown_timer.stop()
        self.capture_thread = self.detection_thread = None
        self._stopping = False
        self.status_label.setText(self.last_error or "已停止，摄像头已释放")
        self.video_label.setText("摄像头已关闭")
        self.video_overlay.setText("已停止")
        self.btn_start.setEnabled(self.model_loaded and not self._closing)
        self.log_message("摄像头与检测线程已退出")
        if self._closing:
            self.close()

    def on_detection_result(self, frame, persons):
        """检测线程检测完成信号的槽函数 - 接收检测结果，更新当前帧并执行自动截图"""
        if not self.is_detecting or self.sender() is not self.detection_thread:
            return
        self.current_frame = frame  # 更新当前帧为绘制了检测框的帧
        self.last_persons = persons  # 保存最新检测到的人物信息
        
        # 若检测到人物，执行自动截图
        if len(persons) > 0:
            self.auto_capture(frame, persons)
    
    def on_detection_error(self, msg):
        """检测线程错误信号的槽函数 - 记录检测错误日志"""
        self.log_message(f"⚠️ 检测模块错误: {msg}", "error")
        self.last_error = msg
        self.stop_detection()
    
    def on_camera_error(self, msg):
        """采集线程错误信号的槽函数 - 记录摄像头错误日志并弹出错误框（优化3：添加窗口图标）"""
        self.log_message(f"🔴 摄像头设备错误: {msg}", "error")
        self.last_error = msg
        self.stop_detection()

    def update_ui(self):
        """UI更新定时器的槽函数 - 每隔33毫秒更新一次界面，保证画面流畅"""
        if self.is_detecting and self.capture_thread is not None:
            frame = self.capture_thread.frame_buffer.get()
            if frame is not None:
                self.on_frame_ready(frame)
        # 若当前无帧，直接返回
        if self.current_frame is None:
            return
        
        # OpenCV帧（BGR格式）转换为PyQt可显示的QPixmap（RGB格式）
        rgb = self.current_frame if len(self.current_frame.shape) == 2 else cv2.cvtColor(self.current_frame, cv2.COLOR_BGR2RGB)
        h, w, ch = rgb.shape if len(rgb.shape) == 3 else (rgb.shape[0], rgb.shape[1], 1)
        bytes_per_line = w * ch
        qt_img = QImage(rgb.data, w, h, bytes_per_line, QImage.Format_RGB888 if ch == 3 else QImage.Format_Grayscale8)
        pixmap = QPixmap.fromImage(qt_img)
        # 缩放QPixmap到视频标签大小，保持宽高比，平滑缩放
        scaled = pixmap.scaled(self.video_label.size(), Qt.KeepAspectRatio, Qt.SmoothTransformation)
        self.video_label.setPixmap(scaled)
        
        # 更新视频覆盖层：FPS、状态、移动人物数
        person_count = len(self.last_persons)
        status = "检测模式" if self.is_detecting else "预览模式"
        self.video_overlay.setText(f"FPS: {self.current_fps:.1f}   |   状态: {status}   |   移动对象: {person_count}")
        
        # 更新右侧统计标签
        self.stats_label.setText(f"抓拍总数: {self.screenshot_count} | 移动目标: {person_count} | 采集帧率: {self.current_fps:.1f} FPS")
    
    def auto_capture(self, frame, persons):
        """自动截图 - 检测到移动人物时执行，带有时间间隔限制，避免连续截图"""
        current_time = time.time()  # 获取当前时间戳
        # 检查是否达到截图间隔，未达到则直接返回
        if current_time - self.last_capture_time < self.capture_interval:
            return
        
        try:
            # 生成时间戳：年-月-日_时-分-秒-毫秒，提高唯一性
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]
            # 生成截图文件名：前缀，序号补4位0
            filename = os.path.join(self.screenshot_dir, f"detect_{timestamp}_{self.screenshot_count:04d}.jpg")
            
            # 为帧添加时间水印，生成带水印的帧
            frame_marked = self.add_watermark(frame.copy())
            # 保存截图：JPEG质量95，平衡画质和文件大小
            self.save_image(filename, frame_marked, 95)
            
            # 更新截图统计和时间戳
            self.screenshot_count += 1
            self.last_capture_time = current_time
            
            # 更新最新截图预览，记录日志
            self.update_preview(frame_marked)
            self.log_message(f"📸 自动抓拍动态目标: {os.path.basename(filename)} (目标数: {len(persons)})")
        except Exception as e:
            # 捕获保存异常，记录错误日志
            self.last_capture_time = current_time
            self.log_message(f"🔴 自动抓拍失败: {str(e)}", "error")
    
    def manual_capture(self):
        """手动拍照 - 响应按钮点击，保存当前帧，无时间间隔限制（优化3：弹窗添加图标）"""
        # 若当前无帧，弹出警告框
        if self.current_frame is None:
            msg = QMessageBox(self)
            msg.setWindowIcon(self.windowIcon())
            msg.setIcon(QMessageBox.Warning)
            msg.setWindowTitle("操作提示")
            msg.setText("无视频画面可保存，请检查摄像头")
            msg.setStandardButtons(QMessageBox.Ok)
            msg.exec_()
            return
        
        try:
            # 生成时间戳
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]
            # 根据是否检测中，生成不同的文件名前缀（命名规范）
            mode = "detect_" if self.is_detecting else "manual_"
            filename = os.path.join(self.screenshot_dir, f"{mode}{timestamp}.jpg")
            
            # 添加水印并保存，质量98
            frame_marked = self.add_watermark(self.current_frame.copy())
            self.save_image(filename, frame_marked, 98)
            
            # 更新截图统计，更新预览，记录日志
            self.screenshot_count += 1
            self.update_preview(frame_marked)
            self.log_message(f"📸 手动抓拍成功: {os.path.basename(filename)}")
            
        except Exception as e:
            # 捕获保存异常，弹出错误框（优化3：添加窗口图标）
            msg = QMessageBox(self)
            msg.setWindowIcon(self.windowIcon())
            msg.setIcon(QMessageBox.Critical)
            msg.setWindowTitle("操作错误")
            msg.setText(f"抓拍保存失败: {str(e)}\n请检查保存路径权限")
            msg.setStandardButtons(QMessageBox.Ok)
            msg.exec_()
    
    @staticmethod
    def save_image(filename, frame, quality):
        # imwrite 在 Windows 中文路径可能静默失败；编码后通过 Python 写文件。
        ok, encoded = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
        if not ok:
            raise OSError("JPEG 编码失败")
        with open(filename, "xb") as output:
            output.write(encoded.tobytes())

    def add_watermark(self, image_array):
        """为帧添加右下角时间水印 - 优化字体、位置、透明度，支持中文"""
        try:
            # OpenCV帧（BGR）转换为PIL图像（RGB）
            pil_img = Image.fromarray(cv2.cvtColor(image_array, cv2.COLOR_BGR2RGB))
            draw = ImageDraw.Draw(pil_img)  # 创建绘图对象
            
            # 字体加载：优先加载微软雅黑UI，兼容更多系统
            try:
                font = ImageFont.truetype("msyh.ttc", 14)  # 增大字体，清晰
            except:
                try:
                    font = ImageFont.truetype("simhei.ttf", 14)
                except:
                    font = ImageFont.load_default(size=14)
            
            # 生成水印文字：包含系统名称+时间，更规范
            time_text = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            
            # 计算水印文字的尺寸和右下角位置
            bbox = draw.textbbox((0, 0), time_text, font=font)
            text_w = bbox[2] - bbox[0]
            text_h = bbox[3] - bbox[1]
            # 内边距：右20，下15，避免边缘裁切
            x = pil_img.width - text_w - 20
            y = pil_img.height - text_h - 15


            # 绘制白色水印文字，清晰
            draw.text((x, y), time_text, font=font, fill=(255, 255, 255, 220))
            
            # PIL图像（RGB）转换回OpenCV帧（BGR）并返回
            return cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
        except Exception as e:
            # 捕获所有异常，返回原帧，不影响核心功能
            return image_array
    
    def update_preview(self, frame):
        """更新最新截图预览 - 缩放，保持宽高比，优化显示"""
        try:
            # 预览尺寸：320x200，保持宽高比
            preview_w, preview_h = 320, 200
            h, w = frame.shape[:2]
            scale = min(preview_w/w, preview_h/h)
            new_w, new_h = int(w*scale), int(h*scale)
            preview = cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_AREA)
            
            # 填充黑色背景，保证预览区域统一尺寸，规范
            pad_top = (preview_h - new_h) // 2
            pad_bottom = preview_h - new_h - pad_top
            pad_left = (preview_w - new_w) // 2
            pad_right = preview_w - new_w - pad_left
            preview = cv2.copyMakeBorder(preview, pad_top, pad_bottom, pad_left, pad_right, cv2.BORDER_CONSTANT, value=(0,0,0))
            
            # BGR转RGB，转换为PyQt可显示的QPixmap
            rgb = cv2.cvtColor(preview, cv2.COLOR_BGR2RGB)
            h_rgb, w_rgb, ch_rgb = rgb.shape
            qt_img = QImage(rgb.data, w_rgb, h_rgb, w_rgb * ch_rgb, QImage.Format_RGB888)
            self.preview_label.setPixmap(QPixmap.fromImage(qt_img))
        except Exception as e:
            # 捕获异常，不做处理，避免影响主程序
            pass
    
    def update_threshold(self, value):
        """置信度数字框值变化的槽函数 - 更新YOLO检测器的置信度阈值"""
        self.yolo_detector.confidence_threshold = value
        self.log_message(f"⚙️ 检测置信度已调整为: {value:.2f}")
    
    def update_interval(self, value):
        """截图间隔数字框值变化的槽函数 - 更新自动截图间隔并记录日志"""
        self.capture_interval = value
        self.log_message(f"⚙️ 自动抓拍间隔已调整为: {value:.1f} 秒")
    
    def update_skip(self, index):
        """处理模式组合框索引变化的槽函数 - 更新检测线程的跳帧参数"""
        if self.detection_thread:
            # 根据组合框索引，设置每N帧处理一次
            self.detection_thread.process_every_n_frames = [1, 2, 3][index]
            mode_name = ["实时检测", "平衡模式", "节能模式"][index]
            self.log_message(f"⚙️ 运行模式已切换为: {mode_name} (每{[1,2,3][index]}帧处理一次)")
    
    def log_message(self, message, level="info"):
        """记录运行日志 - 优化颜色、时间戳格式，自动滚动"""
        # 日志颜色：info(浅蓝)、warning(黄色)、error(红色)
        colors = {
            "info": "#3498db",
            "warning": "#f39c12",
            "error": "#e74c3c"
        }
        color = colors.get(level, "#3498db")
        # 时间戳：时:分:秒.毫秒，更精准
        time_str = datetime.now().strftime("%H:%M:%S.%f")[:-3]
        # 拼接HTML格式的日志内容，规范
        log_content = f'<span style="color: #95a5a6; font-weight: 600;">[{time_str}]</span> <span style="color: {color};">{message}</span>'
        self.log_text.append(log_content)
        # 自动滚动到日志底部，显示最新内容
        self.log_text.verticalScrollBar().setValue(self.log_text.verticalScrollBar().maximum())
    
    def open_screenshot_folder(self):
        """打开截图保存文件夹 - 跨平台支持，增加错误处理（优化3：弹窗添加图标）"""
        try:
            if sys.platform == "win32":
                os.startfile(self.screenshot_dir)
            elif sys.platform == "darwin":
                import subprocess
                subprocess.call(["open", self.screenshot_dir])
            else:
                import subprocess
                subprocess.call(["xdg-open", self.screenshot_dir])
            self.log_message(f"📂 已打开抓拍保存文件夹: {self.screenshot_dir}")
        except Exception as e:
            # 捕获异常，记录错误并弹出提示（优化3：添加窗口图标）
            self.log_message(f"🔴 无法打开文件夹: {str(e)}", "error")
            msg = QMessageBox(self)
            msg.setWindowIcon(self.windowIcon())
            msg.setIcon(QMessageBox.Warning)
            msg.setWindowTitle("操作提示")
            msg.setText(f"文件夹打开失败: {str(e)}\n请手动前往路径：{self.screenshot_dir}")
            msg.setStandardButtons(QMessageBox.Ok)
            msg.exec_()
    
    def closeEvent(self, event):
        self._closing = True
        if self.capture_thread is not None or self.detection_thread is not None:
            event.ignore()
            self.stop_detection()
            return
        self.ui_timer.stop()
        event.accept()


def main():
    """程序入口函数 - 初始化，适配工控机和高分屏"""
    QApplication.setAttribute(Qt.AA_EnableHighDpiScaling, True)
    QApplication.setAttribute(Qt.AA_UseHighDpiPixmaps, True)
    app = QApplication(sys.argv)  # 初始化PyQt应用
    app.setStyle('Fusion')  # 跨平台统一样式，避免系统样式差异
    app.setApplicationName("VisionGuard")  # 应用名称
    app.setApplicationVersion("2.4.0")  # 版本号
    
    # 高分屏适配：启用高DPI缩放，使用高DPI像素图，保证工控机屏幕清晰
    app.setAttribute(Qt.AA_EnableHighDpiScaling, True)
    app.setAttribute(Qt.AA_UseHighDpiPixmaps, True)
    app.setAttribute(Qt.AA_UseStyleSheetPropagationInWidgetStyles, True)  # 保证QSS样式传播
    
    # 字体设置：统一应用字体，避免控件字体不一致
    font = QFont("Microsoft YaHei UI", 24)
    app.setFont(font)
    
    window = MainWindow()  # 创建主窗口实例
    window.show()  # 显示主窗口
    sys.exit(app.exec_())  # 启动事件循环

# 程序入口：规范，脚本直接运行时执行
if __name__ == "__main__":
    main()
