# 如果脚本不在 Anaconda PowerShell Prompt 内运行，则需要加载 conda 的初始化脚本
# 请根据你的 Anaconda 安装路径调整下面的路径（该行仅在普通 PowerShell 中需要）
& "C:\Users\ghost\anaconda3\shell\condabin\conda-hook.ps1"

# 激活名为 weiboCrawler 的环境
conda activate weiboCrawler

# 切换到目标工作目录
# Set-Location "C:\Projects\graduationProject\WeiboAnalysis"

# 运行 streamlit 应用
streamlit run web/main.py
