package org.openelisglobal.testcalculated.valueholder;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;
import org.openelisglobal.common.util.IdValuePair;

@Entity
@Table(name = "calculation_operation")
public class Operation implements Comparable<Operation> {

    // mathematical operands
    public static final String ADD = "+";
    public static final String SUBTRACT = "-";
    public static final String DIVIDE = "/";
    public static final String MULTIPLY = "*";
    public static final String OPEN_BRACKET = "(";
    public static final String CLOSE_BRACKET = ")";
    public static final String EQUALS = "==";
    public static final String NOT_EQUALS = "!=";
    public static final String GREATER_OR_EQUALS = ">=";
    public static final String LESS_OR_EQUALS = "<=";
    public static final String IN_NORMAL_RANGE = "IS_IN_NORMAL_RANGE";
    public static final String OUTSIDE_NORMAL_RANGE = "IS_OUTSIDE_NORMAL_RANGE";
    public static final String LOGICAL_AND = "&&";
    public static final String LOGICAL_OR = "||";
    // constants
    public static final String TEST_RESULT = "TEST_RESULT";

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "calculation_operation_generator")
    @SequenceGenerator(name = "calculation_operation_generator", sequenceName = "calculation_operation_seq", allocationSize = 1)
    @Column(name = "id")
    private Integer id;

    @Column(name = "operation_order")
    private Integer order;

    @Enumerated(EnumType.STRING)
    @Column(name = "type")
    private OperationType type;

    @Column(name = "value")
    private String value;

    @Column(name = "sample_id")
    private Integer sampleId;

    public Integer getId() {
        return id;
    }

    public void setId(Integer id) {
        this.id = id;
    }

    public OperationType getType() {
        return type;
    }

    public void setType(OperationType type) {
        this.type = type;
    }

    public String getValue() {
        return value;
    }

    public void setValue(String value) {
        this.value = value;
    }

    public Integer getSampleId() {
        return sampleId;
    }

    public void setSampleId(Integer sampleId) {
        this.sampleId = sampleId;
    }

    public Integer getOrder() {
        return order;
    }

    public void setOrder(Integer order) {
        this.order = order;
    }

    public enum OperationType {
        TEST_RESULT("检验结果"), MATH_FUNCTION("运算符"), INTEGER("数值常量"), PATIENT_ATTRIBUTE("患者属性");

        private String displayName;

        private OperationType(String displayName) {
            this.displayName = displayName;
        }

        public String getDisplayName() {
            return this.displayName;
        }

        public static Stream<OperationType> stream() {
            return Stream.of(OperationType.values());
        }
    }

    public enum PatientAttribute {
        AGE("患者年龄（岁）"), WEIGHT("患者体重（千克）");

        private String displayName;

        private PatientAttribute(String displayName) {
            this.displayName = displayName;
        }

        public String getDisplayName() {
            return this.displayName;
        }

        public static Stream<PatientAttribute> stream() {
            return Stream.of(PatientAttribute.values());
        }
    }

    public static List<IdValuePair> mathFunctions() {
        List<IdValuePair> mathFunctions = new ArrayList<>();
        mathFunctions.add(new IdValuePair(ADD, "加"));
        mathFunctions.add(new IdValuePair(SUBTRACT, "减"));
        mathFunctions.add(new IdValuePair(DIVIDE, "除以"));
        mathFunctions.add(new IdValuePair(MULTIPLY, "乘以"));
        mathFunctions.add(new IdValuePair(OPEN_BRACKET, "左括号"));
        mathFunctions.add(new IdValuePair(CLOSE_BRACKET, "右括号"));
        mathFunctions.add(new IdValuePair(EQUALS, "等于"));
        mathFunctions.add(new IdValuePair(NOT_EQUALS, "不等于"));
        mathFunctions.add(new IdValuePair(GREATER_OR_EQUALS, "大于或等于"));
        mathFunctions.add(new IdValuePair(LESS_OR_EQUALS, "小于或等于"));
        mathFunctions.add(new IdValuePair(IN_NORMAL_RANGE, "在参考范围内"));
        mathFunctions.add(new IdValuePair(OUTSIDE_NORMAL_RANGE, "在参考范围外"));
        mathFunctions.add(new IdValuePair(LOGICAL_AND, "并且"));
        mathFunctions.add(new IdValuePair(LOGICAL_OR, "或者"));
        return mathFunctions;
    }

    @Override
    public int compareTo(Operation operation) {
        return this.getOrder().compareTo(operation.getOrder());
    }
}
