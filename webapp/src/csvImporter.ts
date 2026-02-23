interface CsvImporterOptions {
    delimiter?: string;
    encoding?: string;
    skipEmptyLines?: boolean;
    header?: boolean;
    trimFields?: boolean;
}

interface CsvParseResult<T = Record<string, string>> {
    headers: string[] | null;
    data: T[];
    rowCount: number;
    errors?: CsvParseError[];
}

interface CsvParseError {
    row: number;
    message: string;
    field?: string;
}

interface ProjectTaskData {
    "Board": string;
    "Name": string;
    "Status": string;
    "Priority": string;
    "Due Date": Date;
    "Estimated Hours": number;
}

interface CsvImporterOptions {
    delimiter?: string;
    encoding?: string;
    skipEmptyLines?: boolean;
    header?: boolean;
    trimFields?: boolean;
    autoDetectEncoding?: boolean; // 自动检测编码
}

interface CsvParseResult<T = Record<string, string>> {
    headers: string[] | null;
    data: T[];
    rowCount: number;
    encoding?: string; // 返回实际使用的编码
    errors?: CsvParseError[];
}

interface CsvParseError {
    row: number;
    message: string;
    field?: string;
}

class CsvImporter<T = Record<string, string>> {
    private options: Required<CsvImporterOptions>;

    // 常见的编码列表
    private static readonly COMMON_ENCODINGS = [
        'utf-8',
        'gbk',
        'gb2312',
        'big5',
        'shift-jis',
        'euc-kr',
        'iso-8859-1',
        'windows-1252'
    ];

    constructor(options: CsvImporterOptions = {}) {
        this.options = {
            delimiter: options.delimiter || ',',
            encoding: options.encoding || 'utf-8',
            skipEmptyLines: options.skipEmptyLines !== false,
            header: options.header !== false,
            trimFields: options.trimFields !== false,
            autoDetectEncoding: options.autoDetectEncoding !== false, // 默认开启自动检测
        };
    }

    /**
     * 从 File 对象读取并解析 CSV 文件
     * @param file - 要读取的 File 对象
     * @returns 解析后的 CSV 数据
     */
    public async readFile(file: File): Promise<CsvParseResult<T>> {
        try {
            const { content, encoding } = await this.readFileWithEncoding(file);
            const result = this.parseCsv(content);
            return {
                ...result,
                encoding // 返回实际使用的编码
            };
        } catch (error) {
            throw new Error(`读取CSV文件失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 自动检测并读取文件编码
     */
    private async readFileWithEncoding(file: File): Promise<{ content: string; encoding: string }> {
        // 如果指定了编码且不自动检测，直接使用指定编码
        if (!this.options.autoDetectEncoding) {
            const content = await this.readFileAsText(file, this.options.encoding);
            return { content, encoding: this.options.encoding };
        }

        // 自动检测编码
        const buffer = await this.readFileAsArrayBuffer(file);
        const detectedEncoding = await this.detectEncoding(buffer, file.type);
        
        try {
            // 使用检测到的编码读取
            const content = await this.readFileAsText(file, detectedEncoding);
            return { content, encoding: detectedEncoding };
        } catch (error) {
            console.warn(`使用检测到的编码 ${detectedEncoding} 读取失败，尝试其他编码...`);
            
            // 如果检测到的编码失败，尝试其他常见编码
            for (const encoding of CsvImporter.COMMON_ENCODINGS) {
                if (encoding === detectedEncoding) continue;
                
                try {
                    const content = await this.readFileAsText(file, encoding);
                    console.log(`成功使用编码 ${encoding} 读取文件`);
                    return { content, encoding };
                } catch {
                    // 继续尝试下一个编码
                }
            }
            
            throw new Error('无法使用任何已知编码读取文件');
        }
    }

    /**
     * 检测文件编码
     */
    private async detectEncoding(buffer: ArrayBuffer, mimeType: string): Promise<string> {
        const uint8Array = new Uint8Array(buffer);
        const len = Math.min(uint8Array.length, 1024); // 只检查前1024个字节
        
        // 检查UTF-8 BOM
        if (len >= 3 && uint8Array[0] === 0xEF && uint8Array[1] === 0xBB && uint8Array[2] === 0xBF) {
            return 'utf-8';
        }
        
        // 检查UTF-16 LE BOM
        if (len >= 2 && uint8Array[0] === 0xFF && uint8Array[1] === 0xFE) {
            return 'utf-16le';
        }
        
        // 检查UTF-16 BE BOM
        if (len >= 2 && uint8Array[0] === 0xFE && uint8Array[1] === 0xFF) {
            return 'utf-16be';
        }
        
        // 检查是否为UTF-8（没有BOM）
        let isUtf8 = true;
        let i = 0;
        while (i < len) {
            if (uint8Array[i] <= 0x7F) {
                i++;
            } else if (uint8Array[i] >= 0xC2 && uint8Array[i] <= 0xDF && i + 1 < len) {
                if (uint8Array[i + 1] >= 0x80 && uint8Array[i + 1] <= 0xBF) {
                    i += 2;
                } else {
                    isUtf8 = false;
                    break;
                }
            } else if (uint8Array[i] >= 0xE0 && uint8Array[i] <= 0xEF && i + 2 < len) {
                if (uint8Array[i + 1] >= 0x80 && uint8Array[i + 1] <= 0xBF &&
                    uint8Array[i + 2] >= 0x80 && uint8Array[i + 2] <= 0xBF) {
                    i += 3;
                } else {
                    isUtf8 = false;
                    break;
                }
            } else {
                isUtf8 = false;
                break;
            }
        }
        
        if (isUtf8) {
            return 'utf-8';
        }
        
        // 检查是否为GBK/GB2312（中文字符）
        // 简化的检查：如果包含高位字节且在GBK范围内
        let hasHighByte = false;
        let possibleGbCount = 0;
        
        for (i = 0; i < len; i++) {
            if (uint8Array[i] > 0x7F) {
                hasHighByte = true;
                // GBK中文字符通常在 0xB0-0xF7 和 0xA1-0xFE 范围内
                if ((uint8Array[i] >= 0xB0 && uint8Array[i] <= 0xF7) ||
                    (uint8Array[i] >= 0xA1 && uint8Array[i] <= 0xA9)) {
                    possibleGbCount++;
                }
            }
        }
        
        if (hasHighByte && possibleGbCount > len * 0.2) { // 超过20%的字节可能是中文
            // 根据用户地理位置或浏览器语言偏好选择
            const userLang = navigator.language || '';
            if (userLang.includes('zh-TW') || userLang.includes('zh-HK')) {
                return 'big5'; // 繁体中文
            } else if (userLang.includes('zh')) {
                return 'gbk'; // 简体中文
            }
            return 'gbk'; // 默认使用GBK
        }
        
        // 默认返回UTF-8
        return 'utf-8';
    }

    /**
     * 读取文件为ArrayBuffer
     */
    private readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as ArrayBuffer);
            reader.onerror = (e) => reject(e.target?.error);
            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * 读取文件内容为文本
     */
    private readFileAsText(file: File, encoding: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e: ProgressEvent<FileReader>) => {
                if (e.target?.result) {
                    resolve(e.target.result as string);
                } else {
                    reject(new Error('文件读取结果为空'));
                }
            };
            
            reader.onerror = (e: ProgressEvent<FileReader>) => {
                reject(e.target?.error || new Error('未知文件读取错误'));
            };
            
            // 处理特殊编码
            if (encoding.toLowerCase() === 'gbk' || encoding.toLowerCase() === 'gb2312') {
                this.readGBKFile(file, resolve, reject);
            } else {
                reader.readAsText(file, encoding);
            }
        });
    }

    /**
     * 专门处理GBK编码的文件（浏览器原生不支持）
     */
    private readGBKFile(
        file: File, 
        resolve: (value: string) => void, 
        reject: (reason?: any) => void
    ): void {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                const arrayBuffer = e.target?.result as ArrayBuffer;
                const uint8Array = new Uint8Array(arrayBuffer);
                
                // 使用TextDecoder（如果支持）
                if (window.TextDecoder) {
                    try {
                        // 尝试使用gbk解码
                        const decoder = new TextDecoder('gbk', { fatal: false });
                        const text = decoder.decode(uint8Array);
                        resolve(text);
                        return;
                    } catch {
                        // TextDecoder不支持gbk，继续使用备用方案
                    }
                }
                
                // 备用方案：使用iconv-lite或类似的库
                // 这里简单返回原始数据，实际使用中可能需要引入专门的编码库
                console.warn('当前环境不支持GBK解码，返回原始数据');
                resolve(new TextDecoder('utf-8').decode(uint8Array));
            } catch (error) {
                reject(error);
            }
        };
        
        reader.onerror = (e) => reject(e.target?.error);
        reader.readAsArrayBuffer(file);
    }

    /**
     * 异步逐行读取大文件（流式处理）
     * @param file - 要读取的 File 对象
     * @param onChunk - 每批数据的回调函数
     * @param chunkSize - 每批处理的行数
     */
    public async readLargeFile(
        file: File, 
        onChunk: (chunk: T[], headers: string[] | null) => void | Promise<void>,
        chunkSize: number = 1000
    ): Promise<void> {
        const { encoding } = await this.readFileWithEncoding(file);
        
        const stream = file.stream();
        const reader = stream.getReader();
        const decoder = new TextDecoder(encoding);
        
        let buffer = '';
        let headers: string[] | null = null;
        let currentChunk: T[] = [];
        let lineCount = 0;
        let isFirstChunk = true;

        try {
            while (true) {
                const { done, value } = await reader.read();
                
                if (done) {
                    // 处理剩余的数据
                    if (buffer.trim()) {
                        await this.processBufferLines(
                            buffer, 
                            headers, 
                            currentChunk, 
                            lineCount, 
                            chunkSize,
                            onChunk,
                            isFirstChunk
                        );
                    }
                    // 发送最后一批数据
                    if (currentChunk.length > 0) {
                        await onChunk(currentChunk, headers);
                    }
                    break;
                }

                // 解码二进制数据
                const chunk = decoder.decode(value, { stream: true });
                buffer += chunk;

                // 按行分割处理
                const lines = buffer.split(/\r?\n/);
                buffer = lines.pop() || ''; // 保存不完整的最后一行

                // 处理完整的行
                if (isFirstChunk && this.options.header && lines.length > 0) {
                    // 第一行是表头
                    headers = this.parseLine(lines[0]);
                    lines.shift();
                    isFirstChunk = false;
                }

                for (const line of lines) {
                    if (this.options.skipEmptyLines && this.isEmptyLine(line)) {
                        continue;
                    }

                    const values = this.parseLine(line);
                    
                    if (headers) {
                        const row = this.createRowFromHeaders(headers, values);
                        currentChunk.push(row as unknown as T);
                    } else {
                        currentChunk.push(values as unknown as T);
                    }

                    lineCount++;

                    // 达到批处理大小，发送数据
                    if (currentChunk.length >= chunkSize) {
                        await onChunk(currentChunk, headers);
                        currentChunk = [];
                    }
                }
            }
        } catch (error) {
            throw new Error(`流式读取失败: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            reader.releaseLock();
        }
    }

    /**
     * 从字符串解析 CSV 内容
     * @param content - CSV 格式的字符串
     * @returns 解析后的 CSV 数据
     */
    public parseCsv(content: string): CsvParseResult<T> {
        const lines = content.split(/\r?\n/);
        const errors: CsvParseError[] = [];
        
        let headers: string[] | null = null;
        let data: T[] = [];
        let startIndex = 0;

        // 解析表头
        if (this.options.header && lines.length > 0) {
            try {
                headers = this.parseLine(lines[0]);
                startIndex = 1;
            } catch (error) {
                errors.push({
                    row: 0,
                    message: `解析表头失败: ${error instanceof Error ? error.message : String(error)}`
                });
                headers = [];
            }
        }

        // 解析数据行
        for (let i = startIndex; i < lines.length; i++) {
            const line = lines[i];
            
            // 跳过空行
            if (this.options.skipEmptyLines && this.isEmptyLine(line)) {
                continue;
            }

            try {
                const values = this.parseLine(line);
                
                if (this.options.header && headers) {
                    // 返回对象格式
                    const row = this.createRowFromHeaders(headers, values, i, errors);
                    if (Object.keys(row).length > 0) {
                        data.push(row as unknown as T);
                    }
                } else {
                    // 返回数组格式
                    if (values.length > 0) {
                        data.push(values as unknown as T);
                    }
                }
            } catch (error) {
                errors.push({
                    row: i + 1,
                    message: `解析行失败: ${error instanceof Error ? error.message : String(error)}`
                });
            }
        }

        // 如果有错误，记录但不中断
        if (errors.length > 0) {
            console.warn('CSV解析过程中发现错误:', errors);
        }

        return {
            headers: headers || null,
            data,
            rowCount: data.length,
            errors: errors.length > 0 ? errors : undefined
        };
    }


    /**
     * 解析单行CSV
     * 处理引号内的逗号和换行符
     */
    private parseLine(line: string): string[] {
        const result: string[] = [];
        let inQuotes = false;
        let currentValue = '';
        let i = 0;

        while (i < line.length) {
            const char = line[i];

            if (char === '"') {
                // 处理转义的引号（"")
                if (i + 1 < line.length && line[i + 1] === '"') {
                    currentValue += '"';
                    i += 2;
                    continue;
                }
                inQuotes = !inQuotes;
                i++;
            } else if (char === this.options.delimiter && !inQuotes) {
                // 字段结束
                result.push(this.options.trimFields ? currentValue.trim() : currentValue);
                currentValue = '';
                i++;
            } else {
                currentValue += char;
                i++;
            }
        }

        // 添加最后一个字段
        result.push(this.options.trimFields ? currentValue.trim() : currentValue);

        return result;
    }

    /**
     * 从表头和值创建行对象
     */
    private createRowFromHeaders(
        headers: string[], 
        values: string[], 
        rowIndex?: number,
        errors?: CsvParseError[]
    ): Record<string, string> {
        const row: Record<string, string> = {};

        headers.forEach((header, index) => {
            const fieldName = this.options.trimFields ? header.trim() : header;
            
            if (index < values.length) {
                row[fieldName] = values[index];
            } else {
                // 列数不匹配，填充空字符串
                row[fieldName] = '';
                if (errors && rowIndex !== undefined) {
                    errors.push({
                        row: rowIndex,
                        message: `列数不匹配: 表头有 ${headers.length} 列，但当前行只有 ${values.length} 列`,
                        field: fieldName
                    });
                }
            }
        });

        return row;
    }

    /**
     * 处理缓冲区中的行（用于流式读取）
     */
    private async processBufferLines(
        buffer: string,
        headers: string[] | null,
        currentChunk: T[],
        lineCount: number,
        chunkSize: number,
        onChunk: (chunk: T[], headers: string[] | null) => void | Promise<void>,
        isFirstChunk: boolean
    ): Promise<void> {
        const lines = buffer.split(/\r?\n/);
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            if (isFirstChunk && i === 0 && this.options.header) {
                // 第一行是表头，已经在主循环中处理
                continue;
            }

            if (this.options.skipEmptyLines && this.isEmptyLine(line)) {
                continue;
            }

            const values = this.parseLine(line);
            
            if (headers) {
                const row = this.createRowFromHeaders(headers, values);
                currentChunk.push(row as unknown as T);
            } else {
                currentChunk.push(values as unknown as T);
            }

            if (currentChunk.length >= chunkSize) {
                await onChunk(currentChunk, headers);
                currentChunk = [];
            }
        }
    }

    /**
     * 检查行是否为空
     */
    private isEmptyLine(line: string): boolean {
        return !line || line.trim().length === 0;
    }

    /**
     * 设置新选项
     */
    public setOptions(options: CsvImporterOptions): void {
        this.options = {
            ...this.options,
            ...options
        };
    }

    /**
     * 获取当前选项
     */
    public getOptions(): Required<CsvImporterOptions> {
        return { ...this.options };
    }
}

export {CsvImporter, ProjectTaskData};