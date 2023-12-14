class Strings {
    constructor() {
        this.startRanges = [32, 65, 191, 913, 931];
        this.endRanges = [64, 127, 688, 930, 1155];
        this.cumulativeLength = Array(this.startRanges.length + 1);

        for (let arrayIndex = 0; arrayIndex < this.cumulativeLength.length; arrayIndex++) {
            this.cumulativeLength[arrayIndex] = 0;
            for (let typeIndex = arrayIndex - 1; 0 <= typeIndex; typeIndex--) {
                this.cumulativeLength[arrayIndex] += this.endRanges[typeIndex] - this.startRanges[typeIndex]
            }
        }
    }

    getCharTypeIndex(char) {
        for (let charIndex = this.startRanges.length - 1; 0 <= charIndex; charIndex--)
            if (char >= this.startRanges[charIndex] && char < this.endRanges[charIndex]) return charIndex;
        return -1
    }

    isValidName(name) {
        let isValid;
        name = name.trim();
        if (0 === name.indexOf("Bot ") || 0 === name.indexOf("[Bot] ")) isValid = false;
        else loop: {
            name = name.trim();
            if (3 > name.length || 20 < name.length) isValid = false;
            else {
                let upperCaseCount = 0
                for (let charCode, nameIndex = 0; nameIndex < name.length; nameIndex++) {
                    charCode = name.charCodeAt(nameIndex);
                    upperCaseCount += 65 <= charCode && 90 >= charCode || 1040 <= charCode && 1071 >= charCode ? 1 : 0;
                    if (-1 === this.getCharTypeIndex(charCode)) {
                        isValid = false;
                        break loop
                    }
                }
                isValid = 3 >= upperCaseCount || upperCaseCount <= Math.floor(name.length / 2)
            }
        }
        return isValid
    };

    convertToCharcode(string) {
        string = string.trim();
        let charCodeArray = []
        for (let currentCharCode, strIndex = 0; strIndex < string.length; strIndex++) {
            currentCharCode = string.charCodeAt(strIndex);
            let charTypeIndex = this.getCharTypeIndex(currentCharCode);
            charCodeArray.push(this.cumulativeLength[charTypeIndex] + currentCharCode - this.startRanges[charTypeIndex])
        }
        return charCodeArray
    };

    convertToString(charCodeArray) {
        let string = ""
        for (let rangeIndex, charCodeIndex = 0; charCodeIndex < charCodeArray.length; charCodeIndex++) {
            for (rangeIndex = 1; rangeIndex < this.cumulativeLength.length; rangeIndex++) {
                if (charCodeArray[charCodeIndex] < this.cumulativeLength[rangeIndex]) {
                    rangeIndex = this.startRanges[rangeIndex - 1] + charCodeArray[charCodeIndex] - this.cumulativeLength[rangeIndex - 1];
                    string += String.fromCharCode(rangeIndex);
                    break
                }
            }
        }
        return string
    };
}

module.exports = Strings