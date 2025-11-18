// Java example
public class Example {
    private String name;

    public Example(String name) {
        this.name = name;
    }

    public String getName() {
        return name;
    }

    public static void main(String[] args) {
        Example example = new Example("Test");
        System.out.println("Name: " + example.getName());
    }
}
