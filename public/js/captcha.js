/**
 * 本地 Canvas 滑动拼图验证码（零网络请求）
 * 替代依赖 picsum.photos 的 jigsaw 库
 */
var LocalCaptcha = (function() {
  var W = 300, H = 150;
  var BLOCK = 42;  // 拼图块大小
  var R = 9;       // 拼图凸起半径
  var THRESHOLD = 5; // 允许误差 px

  function create(options) {
    var el = options.el;
    var onSuccess = options.onSuccess || function(){};
    var onFail = options.onFail || function(){};

    var targetX = 0;
    var isDragging = false;
    var startX = 0;
    var currentX = 0;

    el.innerHTML = '';
    el.style.position = 'relative';
    el.style.width = W + 'px';
    el.style.userSelect = 'none';

    // 主 canvas（背景 + 缺口）
    var mainCanvas = document.createElement('canvas');
    mainCanvas.width = W; mainCanvas.height = H;
    mainCanvas.style.borderRadius = '8px';
    mainCanvas.style.display = 'block';
    el.appendChild(mainCanvas);

    // 滑块 canvas
    var blockCanvas = document.createElement('canvas');
    blockCanvas.width = BLOCK + R * 2 + 4;
    blockCanvas.height = H;
    blockCanvas.style.position = 'absolute';
    blockCanvas.style.top = '0';
    blockCanvas.style.left = '0';
    el.appendChild(blockCanvas);

    // 滑轨
    var slider = document.createElement('div');
    slider.style.cssText = 'position:relative;height:40px;margin-top:8px;background:#f0f0f0;border-radius:20px;overflow:hidden;border:1px solid #e0e0e0';
    var sliderTrack = document.createElement('div');
    sliderTrack.style.cssText = 'position:absolute;left:0;top:0;height:100%;width:0;background:linear-gradient(90deg,#91d5ff,#1890ff);border-radius:20px;transition:none';
    var sliderBtn = document.createElement('div');
    sliderBtn.style.cssText = 'position:absolute;left:0;top:0;width:44px;height:40px;background:#fff;border-radius:20px;box-shadow:0 2px 8px rgba(0,0,0,.15);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:18px;transition:none;z-index:2';
    sliderBtn.textContent = '→';
    var sliderHint = document.createElement('div');
    sliderHint.style.cssText = 'position:absolute;left:0;right:0;top:0;height:100%;display:flex;align-items:center;justify-content:center;font-size:13px;color:#999;pointer-events:none';
    sliderHint.textContent = '向右拖动滑块完成验证';
    slider.appendChild(sliderTrack);
    slider.appendChild(sliderHint);
    slider.appendChild(sliderBtn);
    el.appendChild(slider);

    // 刷新按钮
    var refreshBtn = document.createElement('div');
    refreshBtn.style.cssText = 'position:absolute;top:6px;right:6px;width:24px;height:24px;background:rgba(255,255,255,.85);border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:14px;box-shadow:0 1px 4px rgba(0,0,0,.1)';
    refreshBtn.textContent = '↻';
    refreshBtn.title = '刷新';
    refreshBtn.onclick = function() { draw(); reset(); };
    el.appendChild(refreshBtn);

    function drawPath(ctx, x, y, operation) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + BLOCK / 3, y);
      ctx.arc(x + BLOCK / 2, y - R + 2, R, 0.72 * Math.PI, 0.28 * Math.PI);
      ctx.lineTo(x + BLOCK, y);
      ctx.lineTo(x + BLOCK, y + BLOCK / 3);
      ctx.arc(x + BLOCK + R - 2, y + BLOCK / 2, R, 1.22 * Math.PI, 0.78 * Math.PI);
      ctx.lineTo(x + BLOCK, y + BLOCK);
      ctx.lineTo(x, y + BLOCK);
      ctx.lineTo(x, y + BLOCK / 3);
      ctx.arc(x + R - 2, y + BLOCK / 2, R, 2.76 * Math.PI, 1.24 * Math.PI, true);
      ctx.lineTo(x, y);
      ctx.closePath();
      if (operation === 'fill') { ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fill(); }
      else if (operation === 'clip') { ctx.clip(); }
      else { ctx.stroke(); }
    }

    function generateBackground(ctx) {
      // 随机渐变背景
      var grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, randomColor(60, 160));
      grad.addColorStop(0.5, randomColor(80, 180));
      grad.addColorStop(1, randomColor(60, 160));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // 随机圆形装饰
      for (var i = 0; i < 12; i++) {
        ctx.beginPath();
        ctx.arc(Math.random() * W, Math.random() * H, Math.random() * 30 + 10, 0, Math.PI * 2);
        ctx.fillStyle = randomColor(100, 200, 0.3);
        ctx.fill();
      }

      // 随机线条噪点
      for (var j = 0; j < 6; j++) {
        ctx.beginPath();
        ctx.moveTo(Math.random() * W, Math.random() * H);
        ctx.lineTo(Math.random() * W, Math.random() * H);
        ctx.strokeStyle = randomColor(100, 200, 0.5);
        ctx.lineWidth = Math.random() * 2;
        ctx.stroke();
      }
    }

    function randomColor(min, max, alpha) {
      var r = Math.floor(Math.random() * (max - min) + min);
      var g = Math.floor(Math.random() * (max - min) + min);
      var b = Math.floor(Math.random() * (max - min) + min);
      return alpha ? 'rgba('+r+','+g+','+b+','+alpha+')' : 'rgb('+r+','+g+','+b+')';
    }

    function draw() {
      var mainCtx = mainCanvas.getContext('2d');
      var blockCtx = blockCanvas.getContext('2d');
      mainCtx.clearRect(0, 0, W, H);
      blockCtx.clearRect(0, 0, blockCanvas.width, H);

      // 随机目标位置
      targetX = Math.floor(Math.random() * (W - BLOCK * 2 - R * 2) + BLOCK + R);
      var y = Math.floor(Math.random() * (H - BLOCK - R * 2 - 20) + R + 10);

      // 生成背景
      generateBackground(mainCtx);

      // 在主canvas画缺口（阴影）
      drawPath(mainCtx, targetX, y, 'fill');

      // 在block canvas裁剪拼图块
      blockCtx.save();
      drawPath(blockCtx, 0, y, 'clip');
      // 将主canvas对应区域画到block canvas
      blockCtx.drawImage(mainCanvas, targetX - 2, 0, BLOCK + R * 2 + 4, H, 0, 0, BLOCK + R * 2 + 4, H);
      blockCtx.restore();

      // 拼图块边框
      blockCtx.save();
      drawPath(blockCtx, 0, y, 'stroke');
      blockCtx.strokeStyle = 'rgba(255,255,255,.8)';
      blockCtx.lineWidth = 1.5;
      blockCtx.stroke();
      blockCtx.restore();

      // 在主canvas上重新画缺口遮罩
      mainCtx.save();
      drawPath(mainCtx, targetX, y, 'fill');
      mainCtx.restore();
    }

    function reset() {
      isDragging = false;
      currentX = 0;
      blockCanvas.style.left = '0px';
      sliderBtn.style.left = '0px';
      sliderTrack.style.width = '0px';
      sliderBtn.style.background = '#fff';
      sliderHint.style.display = '';
    }

    function handleStart(e) {
      isDragging = true;
      startX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
      sliderHint.style.display = 'none';
    }

    function handleMove(e) {
      if (!isDragging) return;
      e.preventDefault();
      var x = (e.clientX || (e.touches && e.touches[0].clientX) || 0) - startX;
      x = Math.max(0, Math.min(x, W - 44));
      currentX = x;
      blockCanvas.style.left = x + 'px';
      sliderBtn.style.left = x + 'px';
      sliderTrack.style.width = (x + 22) + 'px';
    }

    function handleEnd() {
      if (!isDragging) return;
      isDragging = false;
      if (Math.abs(currentX - targetX) < THRESHOLD) {
        // 成功
        sliderBtn.style.background = '#52c41a';
        sliderBtn.textContent = '✓';
        sliderHint.textContent = '验证通过';
        sliderHint.style.display = '';
        sliderHint.style.color = '#52c41a';
        onSuccess();
      } else {
        // 失败，重置
        sliderBtn.style.background = '#ff4d4f';
        sliderBtn.textContent = '✗';
        setTimeout(function() {
          draw();
          reset();
          sliderBtn.textContent = '→';
          sliderHint.textContent = '向右拖动滑块完成验证';
          onFail();
        }, 600);
      }
    }

    // 事件绑定
    sliderBtn.addEventListener('mousedown', handleStart);
    sliderBtn.addEventListener('touchstart', handleStart);
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('touchmove', handleMove, { passive: false });
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchend', handleEnd);

    // 首次绘制
    draw();
  }

  return { init: create };
})();
